var Appcore = require("../");
var test = require("tape");

test('constructs a new application with name', function(t) {
	t.plan(3);
	var app = Appcore("myapp");
	t.ok(Appcore.isApp(app), "is an app instance");
	t.ok(app.id, "has app id");
	t.equal(app.name, "myapp", "has correct name");
});

test('constructs a new application without a name', function(t) {
	t.plan(3);
	var app = new Appcore();
	t.ok(Appcore.isApp(app), "is an app instance");
	t.ok(app.id, "has app id");
	t.equal(app.name, app.id, "app name is app id");
});

test('creates an application with a custom configuration and name', function(t) {
	t.plan(5);

	var opts = {};
	var before = false;

	var MyApp = Appcore.create("myapp", function(options) {
		t.equal(options, opts, "passed arguments through");
		t.ok(Appcore.isApp(this), "is an app instance");
		t.equal(this.name, "myapp", "app instance has correct name");
		inner = this;
	});

	t.ok(Appcore.isClass(MyApp), "is an app class");

	var app = MyApp(opts);
	t.equal(inner, app, "is the same app instance");
	t.end();
});
