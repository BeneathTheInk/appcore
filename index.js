var _ = require("underscore"),
	path = require("path"),
	Backbone = require("backbone"),
	debug = require("debug"),
	cluster = require("cluster"),
	objectPath = require("object-path"),
	randId = require('alphanumeric-id'),
	asyncWait = require("asyncwait"),
	hjson = require("hjson"),
	fs = require("fs");

var hasClusterSupport = cluster.Worker != null;

var Application =
module.exports = function(name, options) {
	if (!(this instanceof Application)) {
		return new Application(name, options);
	}

	if (_.isObject(name) && options == null) {
		options = name;
		name = options.name;
	}

	if (typeof name === "string" && name != "") this.name = name;
	this.id = randId(12);
	this.options = {}; // fresh options

	// assign protected props that are known
	Application.assignProps(this, {
		isMaster: !hasClusterSupport || cluster.isMaster,
		isWorker: hasClusterSupport && cluster.isWorker,
		isClient: typeof window !== "undefined",
		isServer: typeof window === "undefined"
	});

	this.configure(options);
}

Application.Events = Backbone.Events;
Application.extend = Backbone.Model.extend;

// like extend, but prefills the constructor/configure
Application.create = function(configure, props, sprops) {
	if (typeof configure !== "function")
		throw new Error("Expecting function for configure.");

	var klass = this;
	var ctor = klass.extend(_.extend({
		constructor: function(name, options) {
			if (!(this instanceof ctor)) {
				return new ctor(name, options);
			}
			klass.call(this, name, options);
		},
		configure: configure
	}, props), sprops);

	return ctor;
}

// quick method for making an application and starting it
// this makes an application class a compatible plugin
// you cannot pass configure options using this method
Application.start = function() {
	var app = new this();
	app.start.apply(app, arguments);
	return app;
}

Application.isApp = function(obj) {
	return Boolean(
		obj != null && (
		obj.__appcore || (
		typeof obj === "function" &&
		obj.prototype.__appcore
	)));
}

var log_levels = Application.log_levels = {
	ALL: -1,
	ERROR: 0,
	WARN: 1,
	INFO: 2,
	DEBUG: 3,
};

// ascending state values
var state_constants = Application.states = {
	FAIL: 0,
	INIT: 1,
	READY: 2,
	RUNNING: 3
}

// attach constants directly to instances and class
_.extend(Application, state_constants);
_.extend(Application.prototype, state_constants);

// lowercase version are methods to call now or on event
_.each(state_constants, function(v, state) {
	Application.prototype[state.toLowerCase()] = function(fn) {
		return this.onState(v, fn);
	}
});

// options defaults
Application.defaults = {
	log: true,
	cwd: process.browser ? "/" : process.cwd(),
	env: process.env.NODE_ENV || "development",
	browserKeys: [ "version", "env", "log" ]
};

// prototype methods/properties
_.extend(Application.prototype, Backbone.Events, {
	__appcore: true,
	name: "app",

	configure: function(){},

	start: function(parent) {
		var self, log, logLevel, lastLogLevel, name, version, args, ancestors, app, fullname;

		args = _.toArray(arguments);
		if (Application.isApp(parent)) args.shift();
		else parent = null;

		// make sure init didn't already get run
		if (this._initDate != null) return this.set.apply(this, args);
		this._initDate = new Date;

		// get the full name by look up the parents
		self = this;
		name = this.name;
		fullname = name;
		app = parent;
		while (app != null) {
			fullname = app.name + ":" + fullname;
			app = app.parent;
		}

		// add protected, immutable properties
		Application.assignProps(this, {
			hasClusterSupport: function() {
				return Boolean(this.get("threads") && hasClusterSupport);
			},
			parent: parent || null,
			isRoot: parent == null,
			fullname: fullname
		});

		// wait for the parent at every state
		if (parent != null) this.on("state", function(s) {
			var wait = this.wait();
			parent.once("state", function() {
				// only continue if parent didn't error up
				if (parent.state !== parent.FAIL) wait();
			});
		});

		// we don't apply default options until now so children apps inherit properly
		if (this.isRoot) this.defaults(Application.defaults);

		// set initial options
		this.set.apply(this, args);

		// auto-enable logging before we make loggers
		log = this.get("log");
		if (log) debug.names.push(new RegExp("^" + fullname));

		// parse the log level
		logLevel = this.get("logLevel");
		if (_.isString(logLevel)) logLevel = Application.log_levels[logLevel.toUpperCase()];
		if (typeof logLevel !== "number" || isNaN(logLevel)) logLevel = -1;

		// make main logger
		this.log = debug(fullname);

		// set up each log level
		_.each(Application.log_levels, function(lvl, name) {
			if (lvl < 0) return;
			this.log[name.toLowerCase()] = logLevel < 0 || logLevel >= lvl ?
				debug(fullname + " [" + name + "]") :
				function(){};
		}, this);

		// add cluster and root specific loggers
		_.each({
			master: this.isMaster,
			worker: this.isWorker,
			root: this.isRoot,
			masterRoot: this.isMaster && this.isRoot,
			rootMaster: this.isRoot && this.isMaster
		}, function(enabled, prop) {
			this.log[prop] = enabled ? (this.log.info || this.log) : function(){};
		}, this);

		// clustering
		if (hasClusterSupport) this.cluster = cluster;

		// log about our new application
		this.log.root(
			"Starting %s application (%sbuild %s)",
			this.get("env"),
			(version = this.get("version")) ? "v" + version + ", " : "",
			this.id
		);

		// set up initial state
		this._modifyState(this.INIT);

		return this;
	},

	use: function(plugin) {
		var isapp = Application.isApp(plugin);

		if (!isapp && !_.isFunction(plugin)) {
			throw new Error("Expecting function or application for plugin.");
		}

		// check if plugin is already loaded on this template
		if (this._plugins == null) this._plugins = [];
		if (~this._plugins.indexOf(plugin)) return this;
		this._plugins.push(plugin);

		var args = _.toArray(arguments).slice(1);
		this.init(function() {
			if (isapp) plugin.start.apply(plugin, [this].concat(args));
			else plugin.apply(this, args);
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

		while (app != null && typeof val === "undefined") {
			val = objectPath.get(app.options, key);
			app = app.parent;
		}

		return val;
	},

	_set: function(obj, safe) {
		if (_.isString(obj)) this.load(obj, safe);
		if (_.isObject(obj)) this.options = Application.merge(this.options, obj, safe);
	},

	set: function() {
		_.each(arguments, function(o) { this._set(o, false); }, this);
		return this;
	},

	defaults: function() {
		_.each(arguments, function(o) { this._set(o, true); }, this);
		return this;
	},

	load: function(file, safe) {
		if (this.isClient) return this;

		// load options from a config file
		try {
			var config = fs.readFileSync(path.resolve(this.get("cwd"), file), { encoding: "utf-8" });
			if (config) this._set(hjson.parse(config), safe);
		} catch(e) {
			if (e.code !== "ENOENT") throw e;
		}

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

	getBrowserOptions: function() {
		var options = {};
		var keys = this.get("browserKeys");
		if (!_.isArray(keys)) keys = keys != null ? [ keys ] : [];
		keys.forEach(function(k) { objectPath.set(options, k, this.get(k)); }, this);
		Application.merge(options, this.get("browserOptions"));
		return options;
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

		// assign wait if not failing
		if (this.state !== this.FAIL && this.state < this.RUNNING) {
			this.wait = asyncWait(_.once(function() {
				// only bump state if we are not failing
				if (this.state !== this.FAIL && this.state < this.RUNNING) {
					this._modifyState(this.state + 1);
				}
			}), this);
		}

		// announce running state
		if (this.state === this.RUNNING) {
			this.log.root("Application started successfully in " + (new Date - this._initDate) + "ms.");
		}

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
		var inRange = (!isAfter && this.state < this.RUNNING) ||
			(isAfter && this.state <= this.RUNNING);

		if (inRange && this._errors && this._errors.length) {
			this.log("Errors preventing startup.");
			this.state = this.FAIL;
			this._announceState();
			return true;
		}

		return false;
	}
});

// a few utilities
_.extend(Application, {

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
	},

	isPlainObject: function(o) {
		return o != null && o.constructor && _.has(o.constructor.prototype, "isPrototypeOf");
	},

	merge: function(obj, val, safe) {
		// recursive for plain objects only
		if (Application.isPlainObject(val)) {
			if (!Application.isPlainObject(obj)) {
				if (safe && !_.isUndefined(obj)) return obj;
				obj = {};
			}

			for (var k in val) {
				obj[k] = Application.merge(obj[k], val[k], safe);
			}

			return obj;
		}

		return safe && !_.isUndefined(obj) ? obj : val;
	}

});
