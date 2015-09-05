var Appcore = require("@beneaththeink/appcore");

// create a new application with a name
var app = module.exports = Appcore({ name: "hit-counter" });

// a few plugins, router is the only mandatory one
app.use(require("@beneaththeink/appcore-config")({
	env: { PORT: "port" }
}));
app.use(require("@beneaththeink/appcore-log"));
app.use(require("@beneaththeink/appcore-router"));

// a simple plugin that keeps track of hits to the page
app.use(function() {
	this.hits = 0;
	this.hit = function() {
		return (++this.hits);
	};
});

// serves up route with jade template
app.ready(function() {
	app.router.set('view engine', 'jade');
	app.router.set('views', __dirname);

	app.router.get("/", function(req, res) {
		res.render("home", {
			title: "Hit Counter",
			hits: app.hit()
		});
	});
});
