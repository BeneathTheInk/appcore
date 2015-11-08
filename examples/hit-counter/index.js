var Appcore = require("../../");
var express = require("express");

// create a new application with a name
var app = module.exports = Appcore({ name: "hit-counter" });

// a few plugins, router is the only mandatory one
app.use(require("appcore-config")({
	env: { PORT: "port" }
}));
app.use(require("appcore-log"));

// a simple plugin that keeps track of hits to the page
app.use(function() {
	this.hits = 0;
	this.hit = function() {
		return (++this.hits);
	};
});

// serves up route with jade template
app.ready(function() {
	var router = express();

	router.set('view engine', 'jade');
	router.set('views', __dirname);

	router.get("/", function(req, res) {
		res.render("home", {
			title: "Hit Counter",
			hits: app.hit()
		});
	});

	var port = this.get("port") || 3000;
	router.listen(port, function() {
		this.log("Listening on port %s", port);
	});
});
