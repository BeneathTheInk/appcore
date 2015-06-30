var _ = require("underscore"),
	path = require("path"),
	Backbone = require("backbone"),
	debug = require("debug"),
	objectPath = require("object-path"),
	asyncWait = require("asyncwait"),
	resolve = require("resolve"),
	fs = require("fs"),
	merge = require("plain-merge");

var Application =
module.exports = function() {
	if (!(this instanceof Application)) return Application.construct(arguments);

	this.id = _.uniqueId("a");
	this.options = {}; // fresh options

	// configure and go
	this.defaultConfiguration();
	this.configure.apply(this, arguments);
}

// a few utilities
_.extend(Application, {
	merge: merge,
	Events: Backbone.Events,
	extend: Backbone.Model.extend,

	construct: function(args) {
		var app = Object.create(this.prototype);
		this.apply(app, args);
		return app;
	},

	// defines protected, immutable properties
	assignProps: function(obj, props) {
		_.each(props, function(val, key) {
			var opts = {
				configurable: false,
				enumerable: true
			};

			if (typeof val === "function") opts.get = val;
			else {
				opts.value = val;
				opts.writable = false;
			}

			Object.defineProperty(obj, key, opts);
		});
	}
});

// like extend, but prefills the constructor/configure
Application.create = function(name, configure, props, sprops) {
	if (typeof name !== "string" || name === "")
		throw new Error("Expecting non-empty string for name.");

	if (typeof configure !== "function")
		throw new Error("Expecting function for configure.");

	var klass = this;
	var ctor = klass.extend(_.extend({
		constructor: function() {
			if (!(this instanceof ctor)) return Application.construct.call(ctor, arguments);
			klass.apply(this, arguments);
		},
		name: name,
		configure: configure
	}, props), sprops);

	return ctor;
}

Application.isApp =
Application.isApplication = function(obj) {
	return Boolean(obj != null && obj.__appcore);
}

Application.isClass = function(klass) {
	return Boolean(_.isFunction(klass) && klass.prototype.__appcore);
}

Application.defaults = {
	log: true,
	cwd: process.browser ? "/" : process.cwd(),
	env: process.env.NODE_ENV || "development"
};

var log_levels = Application.log_levels = {
	ALL: -1,
	ERROR: 0,
	WARN: 1,
	INFO: 2,
	DEBUG: 3
};

// ascending state values
var state_constants = Application.states = {
	FAIL: 0,
	PREBOOT: 1,
	STARTUP: 2,
	READY: 3,
	RUNNING: 4
}

Application.STATE_ERROR = state_constants.FAIL;
Application.STATE_BEGIN = state_constants.PREBOOT;
Application.STATE_END = state_constants.RUNNING;

// attach constants directly to instances and class
_.extend(Application, state_constants);
_.extend(Application.prototype, state_constants);

// lowercase version are methods to call now or on event
_.each(state_constants, function(v, state) {
	Application.prototype[state.toLowerCase()] = function(fn) {
		return this.onState(v, fn);
	}
});

// prototype methods/properties
_.extend(Application.prototype, Backbone.Events, {
	__appcore: true,

	configure: function(name, options) {
		if (typeof name === "object") {
			options = name;
			name = null;
		}

		if (typeof name == "string") this.setName(name);
		if (options) this.set(options);
	},

	setName: function(name) {
		if (typeof name !== "string" || name === "")
			throw new Error("Expecting non-empty string for name.");

		this.name = name;
		this.setupLoggers();

		return this;
	},

	defaultConfiguration: function() {
		// this method can only run once
		if (this.initDate != null) return;
		this.initDate = new Date;

		// set the default name
		if (this.name == null) this.name = this.id;

		// add logging methods
		this.setupLoggers();
		this.on("mount", this.setupLoggers);

		// create the wait method
		this.wait = asyncWait(function() {
			// only bump state if we are not failing
			if (this.state !== Application.STATE_ERROR && this.state < Application.STATE_END) {
				this._modifyState(this.state + 1);
			}
		}, this);

		// set the state immediately to init
		this._modifyState(Application.STATE_BEGIN);
	},

	setupLoggers: function() {
		var log, enabled, logLevel, fullname;

		// auto-enable logging before we make loggers
		fullname = this.fullname;
		enabled = this.get("log");
		if (enabled) debug.names.push(new RegExp("^" + fullname));

		// parse the log level
		logLevel = this.get("logLevel");
		if (_.isString(logLevel)) logLevel = Application.log_levels[logLevel.toUpperCase()];
		if (typeof logLevel !== "number" || isNaN(logLevel)) logLevel = -1;

		// make main logger
		log = this.log = debug(fullname);

		// set up each log level
		_.each(Application.log_levels, function(lvl, name) {
			if (lvl < 0) return;
			log[name.toLowerCase()] = logLevel < 0 || logLevel >= lvl ?
				debug(fullname + " [" + name + "]") :
				function(){};
		});

		// add special loggers
		_.each({
			client: this.isClient,
			server: this.isServer,
			root: this.isRoot
		}, function(enabled, prop) {
			log[prop] = enabled ? (log.info || log) : function(){};
		});
	},

	use: function(plugin) {
		var isapp = Application.isApp(plugin),
			isclass = Application.isClass(plugin),
			isplugin = !isclass && _.isFunction(plugin);

		if (!isapp && !isclass && !isplugin) {
			throw new Error("Expecting function or application for plugin.");
		}

		var args = _.toArray(arguments).slice(1);
		this.preboot(function() {
			if (isplugin) return this.startup(plugin.bind.apply(plugin, [this].concat(args)));
			if (isclass) plugin = plugin.apply(null, args);
			plugin.parent = this;
			this.syncState(plugin);
			plugin.trigger("mount", this);
		});

		return this;
	},

	// forces this app to sync states with a different app.
	// basically this app won't hit a future state until the other app does.
	syncState: function(app) {
		if (this._waitingFor == null) this._waitingFor = [];
		if (_.contains(this._waitingFor, app)) return this;
		this._waitingFor.push(app);

		if (app.state >= this.state) {
			this.once("state", this.syncState.bind(this, app));
			return;
		}

		var wait = this.wait();
		app.once("state", function() {
			// only continue if the state isn't an error
			if (app.state !== Application.STATE_ERROR) {
				wait();
				this.once("state", this.syncState.bind(this, app));
			}
		});

		return this;
	},

	// a recursive method that calls fn when app hits the specified state
	onState: function(val, fn) {
		if (typeof fn !== "function") {
			throw new Error("Expecting a function for callback.");
		}

		if (typeof val === "string" && val) val = Application.states[val.toUpperCase()];
		if (typeof val !== "number" || isNaN(val) || val < 0) {
			throw new Error("Invalid state.");
		}

		// check for fail state specifically or if we have passed the desired state
		if (this.state != null && ((!val && !this.state) || (val > 0 && this.state >= val))) {
			fn.call(this);
		}

		// we don't listen for the specific state event we want, instead
		// we wait for the next state and try again, in a recursive fashion
		// this makes the API appear as though later events are firing in the
		// correct order even though they may have been added in inverse.
		else {
			this.once("state", function() { this.onState(val, fn); });
		}

		return this;
	},

	// does nothing in failing or running state
	next: function(fn) {
		return this.onState(this.state + 1, fn);
	},

	error: function(err) {
		if (this._errors == null) this._errors = [];
		this._errors.push(err);
		this.trigger("error", err);

		if (this.state != null && this.get("logErrors") !== false) {
			var logval;
			if (typeof err === "string") logval = _.toArray(arguments);
			else if (err instanceof Error) logval = [ err.stack || err.toString() ];
			else if (err != null) logval = [ err.message || JSON.stringify(err) ];
			if (logval) this.log.error.apply(null, logval);
		}

		return this;
	},

	get: function(key) {
		var val, app = this;

		while (app != null) {
			val = merge(val, objectPath.get(app.options, key), true);
			app = app.parent;
		}

		// merge the super default value
		val = merge(val, objectPath.get(Application.defaults, key), true);

		return val;
	},

	getBrowserOptions: function() {
		var options = {};
		var keys = this.get("browserKeys");
		if (!_.isArray(keys)) keys = keys != null ? [ keys ] : [];
		keys.forEach(function(k) { objectPath.set(options, k, this.get(k)); }, this);
		merge.extend(options, this.get("browserOptions"));
		return options;
	},

	_set: function(key, val, reset, safe) {
		var root = key == null;

		// prevent accidental annihilation
		if (root && val == null) val = {};

		var cval = root ? this.options : this.get(key);
		var nval = reset ? val : merge(cval, val, safe);

		if (cval !== nval) {
			if (root) this.options = nval;
			else objectPath.set(this.options, key, nval);
		}

		return this;
	},

	unset: function(key) {
		return this._set(key, void 0, true);
	},

	load: function(file, safe) {
		if (this.isClient) return this;
		var fpath, cwd = this.get("cwd");

		// look up as a relative file
		if (!/^\.{0,2}(?:$|\/)/.test(file) &&
			fs.existsSync(path.join(cwd, file))) fpath = path.join(cwd, file);

		// or attempt to resolve like require does
		else { try {
			fpath = resolve.sync(file, { basedir: cwd });
		} catch(e) {} }

		// if the filepath exists, set the data
		if (fpath) this._set(null, require(fpath), false, safe);

		return this;
	},

	resolve: function() {
		var parts = _.toArray(arguments);
		parts.unshift(this.get("cwd"));
		return path.resolve.apply(path, parts);
	},

	relative: function(to) {
		return path.relative(this.get("cwd"), to);
	},

	// sets up the application for a new state
	_modifyState: function(newState) {
		// handle any errors since the last state change
		if (this._handleErrors(false)) return;

		// check for valid state
		if (typeof newState !== "number" || isNaN(newState) || newState < 0) {
			throw new Error("Invalid state.");
		}

		// set the new state
		this.state = newState;

		// wait for the next tick
		process.nextTick(this.wait());

		// annouce the change
		this._announceState();

		// test for more errors
		this._handleErrors(true);
	},

	// triggers state events
	_announceState: function() {
		for (var key in state_constants) {
			if (state_constants[key] === this.state) break;
		}

		if (!key) return;

		try {
			key = key.toLowerCase();
			this.trigger("state:" + this.state);
			this.trigger("state:" + key);
			this.trigger("state", key);
		} catch(e) {
			this.error(e);
		}
	},

	// sets the app into fail mode when there are errors
	_handleErrors: function(isAfter) {
		var inRange = (!isAfter && this.state < Application.STATE_END) ||
			(isAfter && this.state <= Application.STATE_END);

		if (inRange && this._errors && this._errors.length) {
			this.log("Errors preventing startup.");
			this.state = Application.STATE_ERROR;
			this._announceState();
			return true;
		}

		return false;
	}
});

// assign protected props
Application.assignProps(Application.prototype, {
	isClient: typeof window !== "undefined",
	isServer: typeof window === "undefined",
	env: function() {
		return this.get("env");
	},
	isRoot: function() {
		return this.parent == null;
	},
	fullname: function() {
		var fullname = this.name;
		var app = this.parent;

		// get the full name by look up the parents
		while (app != null) {
			fullname = app.name + ":" + fullname;
			app = app.parent;
		}

		return fullname;
	}
});

// create options setter methods
_.each({
	reset: [ true ],
	set: [ false, false ],
	defaults: [ false, true ]
}, function(args, method) {
	Application.prototype[method] = function(key, val) {
		if (typeof key === "object") {
			val = key;
			key = null;
		}

		this._set.apply(this, [ key, val ].concat(args));

		return this;
	}
});

// synonyms
_.each({
	"syncState": [ "waitFor", "waitForApplication" ],
	"use": [ "plugin" ],
	"next": [ "nextState" ],
	"startup": [ "init" ]
}, function(s, n) {
	s.forEach(function(sn) {
		Application.prototype[sn] = function() {
			return this[n].apply(this, arguments);
		}
	});
});
