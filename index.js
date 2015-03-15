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
module.exports = function(name) {
	if (!(this instanceof Application)) {
		return new Application(name);
	}

	if (typeof name === "string" && name != "") this.name = name;
	this.id = randId(12);
	this.options = _.clone(Application.defaults);
	this.configure();
}

Application.Events = Backbone.Events;
Application.extend = Backbone.Model.extend;

// like extend, but prefills the constructor/configure
Application.create = function(configure, props, sprops) {
	if (typeof configure !== "function")
		throw new Error("Expecting function for configure.");

	var ctor = Application.extend(_.extend({
		constructor: function(name) {
			if (!(this instanceof ctor)) {
				return new ctor(name);
			}
			Application.call(this, name);
		},
		configure: configure
	}, props), sprops);

	return ctor;
}

// quick method for making an application and starting it
// this makes an application class a compatible plugin
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
	if (!v) return;// no support for fail
	var lower = state.toLowerCase();
	Application.prototype[lower] = function(fn) {
		if (typeof fn !== "function") {
			throw new Error("Expecting a function for callback.");
		}

		if (this.state != null && this.state !== this.FAIL && this.state >= this[state]) fn.call(this);
		else this.once("state:" + lower, fn);
		
		return this;
	}
})

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

		// add protected properties
		Object.defineProperties(this, {
			hasClusterSupport: {
				get: function() { return this.get("threads") && hasClusterSupport; },
				configurable: false,
				enumerable: true
			},

			isMaster: {
				get: function() { return !hasClusterSupport || cluster.isMaster; },
				configurable: false,
				enumerable: true
			},

			isWorker: {
				get: function() { return hasClusterSupport && cluster.isWorker; },
				configurable: false,
				enumerable: true
			},

			isClient: {
				get: function() { return typeof window !== "undefined"; },
				configurable: false,
				enumerable: true
			},

			isServer: {
				get: function() { return typeof window === "undefined"; },
				configurable: false,
				enumerable: true
			},

			parent: {
				get: function() { return parent || null; },
				configurable: false,
				enumerable: true
			},

			isRoot: {
				get: function() { return parent == null; },
				configurable: false,
				enumerable: true
			}
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
				self.exit(parent.wait());
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
				function kill() { process.kill(process.pid, "SIGUSR2"); }
				if (self.halt()) self.exit(kill);
				else kill();
			});
		}

		// log about our new application
		if (this.isMaster) {
			version = this.get("version");
			this.log("Starting %s application (%sbuild %s)", this.get("env"), version ? "v" + version + ", " : "", this.id);
		}

		// set up state
		this.state = this.INIT;
		this._onStateChange();
		this._announceState();
		this._handleErrors(true);
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

	// handles changing states
	_onStateChange: function() {
		var self = this;

		if (this.state === this.FAIL ||
			this.state === this.EXIT) return;

		this.wait = asyncWait(_.once(function() {
			// don't keep running if we are in exit mode
			if (self.state === self.FAIL ||
				self.state === self.EXIT) return;

			// handle any errors since the last state change
			if (self._handleErrors(false)) return;

			// bump the state
			// on init, master goes straight to ready
			if (self.state < self.READY && self.hasClusterSupport && self.isMaster) {
				self.state = self.RUNNING;
			} else {
				self.state++;
			}
			
			// make the state change
			self._onStateChange();

			// handle running state
			if (self.state === self.RUNNING) {
				self.log.master("Application started successfully in " + (new Date - self._initDate) + "ms.");
				self._onhalt = self.wait();
			}

			// annouce the change
			self._announceState();

			// the state change may have caused some errors
			self._handleErrors(true);
			
			// exit on exit
			if (self.state === self.EXIT) self._fullappexit(0);
		}), this);
	},

	// triggers state events
	_announceState: function() {
		for (var key in state_constants) {
			if (state_constants[key] === this.state) break;
		}

		if (!key) return;

		try {
			key = key.toLowerCase();
			this.trigger("state:" + key);
			this.trigger("state", key);
		} catch(e) {
			this.error(e);
		}
	},

	// a browser compatible quit
	_fullappexit: function(code) {
		if (this.isRoot && typeof process.exit === "function") process.exit(code);
		else this.log.master("Application has exited with status %s", code);
	},

	_handleErrors: function(isAfter) {
		var inRange = (!isAfter && this.state < this.RUNNING) ||
			(isAfter && this.state <= this.RUNNING);

		if (inRange && this._errors && this._errors.length) {
			this.log("Errors preventing startup.");
			this.state = this.FAIL;
			this._announceState();
			this._fullappexit(1);
			return true;
		}

		return false;
	}
});