import _ from "underscore";
import { EventEmitter } from "events";
import asyncWait from "asyncwait";
import subclass from "backbone-extend-standalone";
import assignProps from "assign-props";
import * as $ from "./states";
import optionsSetup, { defaults } from "./options";

function Appcore() {
	if (!(this instanceof Appcore)) {
		return Appcore.construct(arguments);
	}

	EventEmitter.call(this);
	this.defaultConfiguration();
	this.configure.apply(this, arguments);
}

module.exports = Appcore;
_.extend(Appcore, $);
Appcore.prototype = Object.create(EventEmitter.prototype);
Appcore.extend = subclass;
Appcore.defaults = defaults;
Appcore.isApp = (obj) => obj.__appcore;

// like the new operator, but for dynamic arguments
Appcore.construct = function(args) {
	let app = Object.create(this.prototype);
	this.apply(app, args);
	return app;
};

// sugar for extend with auto-constructor and custom configure
Appcore.create = function(configure, props, sprops) {
	if (typeof configure !== "function")
		throw new Error("Expecting function for configure.");

	var klass = this;
	var ctor = klass.extend(_.extend({
		constructor: function() {
			if (!(this instanceof ctor)) {
				return ctor.construct(arguments);
			}

			klass.apply(this, arguments);
		},
		configure: configure
	}, props), sprops);

	return ctor;
};

assignProps(Appcore.prototype, {
	__appcore: true,
	isClient: typeof window !== "undefined",
	isServer: typeof window === "undefined",
	env: function() { return this.get("env"); },
	cwd: function() { return this.get("cwd"); },
	isRoot: function() { return this.parent == null; }
});

Appcore.prototype.configure = function(opts) {
	this.set([], opts);
};

Appcore.prototype.defaultConfiguration = function() {
	// create an id
	this.id = _.uniqueId("a");

	// every app uses the options plugin
	this.use(optionsSetup);

	// create the wait method
	this.wait = asyncWait(() => {
		// only bump state if we are not failing or running
		if ($.atState(this.state, $.STATE_END) ||
			$.isErrorState(this.state)) return;

		this._bumpState();
	});

	// set the state immediately to init
	this._bumpState();
};

Appcore.prototype.use = function(fn) {
	if (arguments.length > 1) {
		for (let f of arguments) this.use(f);
	}

	else if (Appcore.isApp(fn)) {
		this.startup(() => fn.emit("mount", fn.parent = this));
	}

	else if (typeof fn === "function") {
		this.startup(fn);
	}

	else {
		throw new Error("Expecting Appcore instance or function for plugin.");
	}

	return this;
};

// a recursive method that calls fn when app hits the specified state
Appcore.prototype.onState = function(state, fn) {
	if (typeof fn !== "function") {
		throw new Error("Expecting a function for callback.");
	}

	// check if we have passed the desired state
	if ($.atState(this.state, state)) {
		try { fn.call(this); }
		catch(e) { this.error(e); }
	}

	// we don't listen for the specific state event we want, instead
	// we wait for the next state and try again, in a recursive fashion
	// this makes the API appear as though later events are firing in the
	// correct order even though they may have been added in inverse.
	else {
		this.once("state", () => this.onState(state, fn));
	}

	return this;
};

// state methods to call now or on event
for (let state of $.STATES) {
	Appcore.prototype[state] = function(fn) {
		this.onState(state, fn);
	};
}

Appcore.prototype[$.STATE_ERROR] = function(fn) {
	return this.onState($.STATE_ERROR, fn);
};

Appcore.prototype.next = function(fn) {
	return this.onState($.nextState(this.state), fn);
};

Appcore.prototype.error = function(err) {
	// push errors onto the error queue
	if (this.errors == null) this.errors = [];
	this.errors.push(err);

	// emit the error
	this.emit("error", err);

	return this;
};

// sets up the application for a new state
Appcore.prototype._bumpState = function() {
	let cur = this.state;

	if (!$.atState(cur, $.STATE_END)) {
		// handle any errors since the last state change
		if (this.errors && this.errors.length) {
			this.state = $.STATE_ERROR;
		}

		// otherwise go to the next state
		else {
			// set the new state
			this.state = cur == null ?
				$.STATE_START :
				$.nextState(cur);

			// wait for the next tick
			process.nextTick(this.wait());
		}
	}

	// announce the new state
	if (cur !== this.state) {
		try {
			this.emit("state:" + this.state);
			this.emit("state", this.state);
		} catch(e) {
			this.error(e);
		}
	}
};
