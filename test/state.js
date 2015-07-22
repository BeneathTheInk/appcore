var Appcore = require("../");
var test = require("tape");

test("apps moves to states in the correct order", function(t) {
	t.plan(9);

	var ran = 0;
	var app = Appcore();
	t.equal(app.state, Appcore.STATE_BEGIN, "at beginning state");
	t.equal(app.state, Appcore.states.PREBOOT, "at preboot state");

	app.on("state", function(key) {
		t.equal(app.state, Appcore.states[key.toUpperCase()], "passed state key '" + key + "' matches apps state");

		switch (++ran) {
			case 1:
				t.equal(app.state, Appcore.states.STARTUP, "at startup state");
				break;
			case 2:
				t.equal(app.state, Appcore.states.READY, "at ready state");
				break;
			case 3:
				t.equal(app.state, Appcore.states.RUNNING, "at running state");
				t.equal(app.state, Appcore.STATE_END, "at ending state");
				t.end();
				break;
		}
	});
});

test("app calls helper methods on each state", function(t) {
	t.plan(8);

	var app = Appcore();
	var deferred = false;

	app.preboot(function() {
		t.pass("app entered preboot state");
		t.notOk(deferred, "preboot state ran synchronously");
	});

	app.startup(function() {
		t.pass("app entered startup state");
		t.ok(deferred, "startup state ran asynchronously");
	});

	app.ready(function() {
		t.pass("app entered ready state");
		t.ok(deferred, "ready state ran asynchronously");
	});

	app.running(function() {
		t.pass("app entered running state");
		t.ok(deferred, "running state ran asynchronously");
	});

	deferred = true;
});

test("automatically moves states on next tick", function(t) {
	t.plan(1);
	var early = true;

	var app = Appcore();
	app.next(function() {
		t.notOk(early, "was not called early");
	});

	early = false;
});

test("wait prevents app from moving to next state", function(t) {
	t.plan(1);

	var app = Appcore();
	app.next(function() {
		t.fail("app moved to next state instead of waiting");
	});

	var done = app.wait();
	t.equal(typeof done, "function", "result of app.wait() is a function");
});

test("the last wait method to run moves the state synchronously", function(t) {
	t.plan(2);

	var app = Appcore();
	var ran;

	app.next(function() {
		t.equal(ran, false, "waited for timeout");
		ran = true;
	});

	var done = app.wait();

	setTimeout(function() {
		ran = false;
		done();
		t.ok(ran, "next state is run immediately");
	}, 20);
});

test("app.error() puts app into failing state", function(t) {
	t.plan(2);

	var app = Appcore();

	app.fail(function() {
		t.pass("entered failing state");
	});

	app.next(function() {
		t.fail("entered the next state");
	});

	try {
		app.error("some error");
		t.fail("didn't throw the error");
	} catch(e) {
		t.equal(e, "some error", "throws the error");
	}
});

test("app.error() doesn't throw if there is an error event", function(t) {
	t.plan(3);

	var app = Appcore();

	app.on("error", function(e) {
		t.equal(e, "some error", "passed correct error through");
	});

	app.startup(function() {
		t.pass("reached startup state");
		app.error("some error");
	});

	app.ready(function() {
		t.fail("reached ready state");
	});

	app.fail(function() {
		t.pass("entered failing state");
	});
});
