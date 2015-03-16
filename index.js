var _ = require("underscore"),
	path = require("path"),
	Backbone = require("backbone"),
	debug = require("debug"),
	cluster = require("cluster"),
	objectPath = require("object-path"),
	randId = require('alphanumeric-id'),
	merge = require("merge"),
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
	this.options = _.clone(Application.defaults);
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

// ascending state values
var state_constants = Application.states = {
	FAIL: 0,
	INIT: 1,
	READY: 2,
	RUNNING: 3,
	SHUTDOWN: 4,
	EXIT: 5
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
	cwd: process.browser ? "/" : process.cwd(),
	env: process.env.NODE_ENV || "development",
	browser_keys: [ "version", "env", "log" ]
};

// prototype methods/properties
_.extend(Application.prototype, Backbone.Events, {
	name: "app",

	configure: function(){},

	start: function(parent) {
		var self, log, name, attemptExit, version, args;

		args = _.toArray(arguments);
		if (parent instanceof Application) args.shift();
		else parent = null;

		// make sure init didn't already get run
		if (this.state != null) return this.set.apply(this, args);

		this._initDate = new Date;
		self = this;
		name = this.name;

		// add protected, immutable properties
		assignProps(this, {
			hasClusterSupport: function() { return this.get("threads") && hasClusterSupport; },
			isMaster: !hasClusterSupport || cluster.isMaster,
			isWorker: hasClusterSupport && cluster.isWorker,
			isClient: typeof window !== "undefined",
			isServer: typeof window === "undefined",
			parent: parent || null,
			isRoot: parent == null
		});

		// apply the parent
		if (parent != null) {
			// prevent parent from entering running state until this one is running
			parent.ready(function() {
				if (!self.state) return;
				var wait = parent.wait();
				self.once("state:fail", wait);
				self.running(wait);
			});

			// exit the app on parent shutdown
			parent.shutdown(function() {
				// deferred so child can fully exit before parent
				self.exit(_.partial(_.defer, parent.wait()));
				self.halt();
			});
		}

		// set initial options
		this.set.apply(this, args);

		// auto-enable logging before we make loggers
		if (this.isRoot) {
			log = this.get("log")
			if (log) debug.enable(typeof log === "string" ? log : name + "*");
		} else {
			name = parent.name + ":" + name;
		}

		// set up loggers
		this.log = debug(name);
		this.log.error = debug(name + ":error");
		this.log.warn = debug(name + ":warn");
		this.log.debug = debug(name + ":debug");
		this.log.master = function() { if (self.isMaster) self.log.apply(self, arguments); }
		this.log.worker = function() { if (self.isWorker) self.log.apply(self, arguments); }
		this.log.root = function() { if (self.isRoot) self.log.apply(self, arguments); }
		this.log.masterRoot = this.log.rootMaster = function() {
			if (self.isRoot && self.isMaster) self.log.apply(self, arguments);
		}

		// clustering
		if (hasClusterSupport) this.cluster = cluster;

		// on server root, handle normal exits
		if (this.isServer && this.isRoot) {
			attemptExit = function() {
				if (!self.halt()) self._fullappexit(0);
			}

			process.once("SIGINT", attemptExit);
			process.once("SIGTERM", attemptExit);

			// handle nodemon exits
			process.once("SIGUSR2", function() {
				function kill() { self._fullappexit("SIGUSR2"); }
				if (self.halt()) self.exit(kill);
				else kill();
			});
		}

		// log about our new application
		this.log.rootMaster(
			"Starting %s application (%sbuild %s)",
			this.get("env"),
			(version = this.get("version")) ? "v" + version + ", " : "",
			this.id
		);

		// set up state
		this._modifyState(this.INIT);
	},

	use: function(plugin) {
		var isapp = plugin instanceof Application ||
			plugin === Application ||
			plugin.prototype instanceof Application;

		if (!isapp && !_.isFunction(plugin)) {
			throw new Error("Expecting function for plugin.");
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
		if (this.state != null && ((!val && !this.state) || this.state >= val)) {
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

	halt: function() {
		if (this._onhalt != null) {
			var onhalt = this._onhalt;
			delete this._onhalt;
			onhalt();
			return true;
		}

		return false;
	},

	error: function(err) {
		if (this._errors == null) this._errors = [];
		this._errors.push(err);
		this.trigger("error", err);
	
		if (this.state != null && this.get("log_errors") !== false) {
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

	set: function() {
		_.each(arguments, function(obj) {
			if (_.isString(obj)) this.load(obj);
			if (_.isObject(obj)) this.options = merge(this.options, obj);
		}, this);

		return this;
	},

	load: function(file) {
		if (this.isClient) return this;

		// load options from a config file
		try {
			var config = fs.readFileSync(path.resolve(this.get("cwd"), file), { encoding: "utf-8" });
			if (config) this.set(hjson.parse(config));
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
		var options = _.pick(this.get(), this.get("browser_keys"));
		_.extend(options, this.get("browser_options"));
		return options;
	},

	// sets up the application for a new state
	_modifyState: function(newState) {
		var self = this;

		// handle any errors since the last state change
		if (this._handleErrors(false)) return;

		// check for valid state
		if (typeof newState !== "number" || isNaN(newState) || newState < 0) {
			throw new Error("Invalid state.");
		}

		// set the new state
		this.state = newState;

		// fail and exit states are special
		var exitState = this.state === this.FAIL || this.state >= this.EXIT;

		// assign wait if not exitting
		if (!exitState) this.wait = asyncWait(_.once(function() {
			// only bump state if we are in a good state
			if (this.state !== this.FAIL && this.state < this.EXIT) {
				this._modifyState(this.state + 1);
			}
		}), this);

		// handle running state
		if (this.state === this.RUNNING) {
			this.log.rootMaster("Application started successfully in " + (new Date - this._initDate) + "ms.");
			this._onhalt = this.wait();
		}

		// annouce the change
		this._announceState();
		
		// test for more errors and exit on exit
		if (!self._handleErrors(true) && exitState) this._fullappexit(0);
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

	// a browser compatible quit
	_fullappexit: function(code) {
		this.log.rootMaster("Application has exited with status %s", code);
		
		if (this.isRoot) {
			if (code == null) code = 0;
			if (typeof code === "string" && code && typeof process.kill === "function") {
				process.kill(process.pid, code);
			} else if (typeof code === "number" && !isNaN(code) && typeof process.exit === "function") {
				process.exit(code);
			}
		}
	},

	// sets the app into fail mode when there are errors
	_handleErrors: function(isAfter) {
		var inRange = (!isAfter && this.state < this.RUNNING) ||
			(isAfter && this.state <= this.RUNNING);

		if (inRange && this._errors && this._errors.length) {
			this.log("Errors preventing startup.");
			this._modifyState(this.FAIL);
			return true;
		}

		return false;
	}
});

// defines protected, immutable properties
function assignProps(obj, props) {
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