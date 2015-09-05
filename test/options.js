var _ = require("underscore");
var Appcore = require("../");
var test = require("tape");

test("set() sets root value", function(t) {
	t.plan(2);
	var app = Appcore();
	var value = { foo: "bar" };
	app.set(value);
	t.deepEqual(app.options, value, "sets value without key");

	app.set([], { baz: "boom" });
	t.equal(app.get("baz"), "boom", "sets value with empty array key");
});

test("set() sets value at key", function(t) {
	t.plan(1);
	var app = Appcore();
	var value = { bar: "baz" };
	app.set("foo", value);
	t.deepEqual(app.options.foo, value, "'foo' value contains the value set");
});

test("set() merges plain objects", function(t) {
	t.plan(1);
	var app = Appcore();
	app.set({ foo: { bar: "baz" } });
	app.set("foo", { hello: "world" });
	t.deepEqual(app.options.foo, { bar: "baz", hello: "world" }, "'foo' value contains the merged value");
});

test("set() replaces non-plain objects", function(t) {
	t.plan(1);
	var app = Appcore();
	var value = { hello: "world" };
	app.set({ foo: "bar" });
	app.set("foo", value);
	t.deepEqual(app.options.foo, value, "'foo' value contains the replaced value");
});

test("set() throws error when setting a value on root that is not a plain object.", function(t) {
	t.plan(1);
	var app = Appcore();
	t.throws(function() {
		app.set([], "not a plain object");
	}, void 0, "throws an unexpected value error");
});

test("reset() replaces root value", function(t) {
	t.plan(1);
	var app = Appcore();
	var value = { foo: { bar: "baz" } };
	app.set({ hello: "world" });
	app.reset(value);
	t.equal(app.options, value, "root value is the reset value");
});

test("reset() replaces value at key", function(t) {
	t.plan(1);
	var app = Appcore();
	var value = { bar: "baz" };
	app.set("foo", { hello: "world" });
	app.reset("foo", value);
	t.equal(app.options.foo, value, "'foo' value is the reset value");
});

test("defaults() sets over undefined, ignores real values", function(t) {
	t.plan(2);
	var app = Appcore();
	app.set({ hello: "world" });
	app.defaults({ hello: true, foo: "bar" });
	t.equal(app.options.foo, "bar", "set over undefined");
	t.equal(app.options.hello, "world", "ignored real value");
});

test("unset() sets root value to an object", function(t) {
	t.plan(1);
	var app = Appcore();
	app.set({ hello: "world" });
	app.unset();
	t.deepEqual(app.options, {}, "unset the root value");
});

test("unset() sets value at key to undefined", function(t) {
	t.plan(1);
	var app = Appcore();
	app.set({ foo: "bar" });
	app.unset("foo");
	t.equal(app.options.foo, void 0, "unset 'foo' value");
});

test("get() retrieves the root value with defaults", function(t) {
	t.plan(1);
	var app = Appcore();
	app.set({ foo: "bar" });
	var value = app.get();
	t.deepEqual(value, _.extend({}, Appcore.defaults, { foo: "bar" }), "value merged with defaults");
});

test("get() gets value at key", function(t) {
	t.plan(1);
	var app = Appcore();
	app.set({ foo: { bar: "baz" } });
	t.equal(app.get("foo.bar"), "baz", "gets deep value");
});

test("getBrowserOptions() returns object of browser safe options", function(t) {
	t.plan(3);
	var app = Appcore();
	t.deepEqual(app.getBrowserOptions(), { env: 'development' }, "gets base browser options");

	app.set("browserKeys", "foo");
	app.set("foo", "bar");
	t.deepEqual(app.getBrowserOptions(), { foo: 'bar' }, "gets options with custom key");

	app.set("browserKeys", null);
	t.deepEqual(app.getBrowserOptions(), {}, "gets options with no key");
});

test("setBrowserOption() adds key and value to browser safe options", function(t) {
	t.plan(1);
	var app = Appcore();
	app.setBrowserOption("foo", "bar");
	app.setBrowserOption({ baz: "boom" });
	t.deepEqual(app.getBrowserOptions(), { env: "development", foo: "bar", baz: "boom" }, "gets browser options");
});
