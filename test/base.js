var Appcore = require("../");
var test = require("tape");

test('constructs a new application', function(t) {
	t.plan(2);
	var app = Appcore();
	t.ok(Appcore.isApp(app), "is an app instance");
	t.ok(app.id, "has app id");
});

test('creates an application with a custom configuration and name', function(t) {
	t.plan(4);

	var opts = {};
	var inner;

	var MyApp = Appcore.create(function(options) {
		t.equal(options, opts, "passed arguments through");
		t.ok(Appcore.isApp(this), "is an app instance");
		inner = this;
	});

	var app = MyApp(opts);
	t.equal(inner, app, "is the same app instance");
	t.ok(app instanceof MyApp, "is instance of the new app class");
});
