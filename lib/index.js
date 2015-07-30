var _ = require("underscore");
var Events = require("backbone-events-standalone");
var subclass = require("backbone-extend-standalone");
var asyncWait = require("asyncwait");
var optionsSetup = require("./options");

var Application =
module.exports = function() {
	if (!(this instanceof Application)) return Application.construct(arguments);

	this.id = _.uniqueId("a");

	// configure and go
	this.defaultConfiguration();
	this.configure.apply(this, arguments);
}

// a few utilities
_.extend(Application, {
	Events: Events,
	extend: subclass,
	defaults: optionsSetup.defaults,

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
	if (typeof name === "function") {
		sprops = props;
		props = configure;
		configure = name;
		name = null;
	}

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
_.extend(Application.prototype, Events, {
	__appcore: true,

	configure: function(name) {
		if (typeof name == "string") this.name = name;
	},

	defaultConfiguration: function() {
		// this method can only run once
		if (this.initDate != null) return;
		this.initDate = new Date;

		// add config setters and getters
		optionsSetup.call(this);

		// set the default name
		if (this.name == null) this.name = this.id;

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
			try { fn.call(this); }
			catch(e) { this.error(e); }
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
		// push errors onto the error queue
		if (this._errors == null) this._errors = [];
		this._errors = _.union(this._errors, [ err ]);

		// check for error events to trigger or just throw the error
		if (this._events && this._events.error && this._events.error.length) {
			this.trigger("error", err);
		} else {
			throw err;
		}

		return this;
	},

	// sets up the application for a new state
	_modifyState: function(newState) {
		// handle any errors since the last state change
		if (this._handleErrors()) return;

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
	_handleErrors: function() {
		// only enter error state if not yet running and there are errors
		if (this.state < Application.STATE_END && this._errors && this._errors.length) {
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
	env: function() { return this.get("env"); },
	cwd: function() { return this.get("cwd"); },
	isRoot: function() { return this.parent == null; },
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

// synonyms
_.each({
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
