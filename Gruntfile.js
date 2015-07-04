module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clean: [ "dist/", "vendor/" ],
		lodash: {
			mini: {
				dest: "vendor/lodash.js",
				options: {
					modifier: 'modern',
					include: [ "uniqueId", "extend", "each", "isFunction", "isString", "toArray", "contains" ],
					flags: [ "development" ]
				}
			}
		},
		browserify: {
			dist: {
				src: "index.js",
				dest: "dist/appcore.js",
				options: {
					browserifyOptions: { standalone: "Appcore" }
				}
			}
		},
		uglify: {
			dist: {
				src: "dist/appcore.js",
				dest: "dist/appcore.min.js"
			}
		},
		concat: {
			main: {
				files: [{
					expand: true,
					cwd: "dist/",
					src: [ "*.js" ],
					dest: "dist/",
					isFile: true
				}],
				options: {
					banner: "/*\n * Appcore v<%= pkg.version %> \n * (c) 2014-2015 Beneath the Ink, Inc.\n * MIT License\n */\n\n"
				}
			}
		}
	});

	grunt.loadNpmTasks('grunt-lodash');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-concat');

	grunt.registerTask('setup', [ 'clean', 'lodash' ]);
	grunt.registerTask('build', [ 'browserify', 'uglify', 'concat' ]);
	grunt.registerTask('dist', [ 'setup', 'build' ]);
	grunt.registerTask('default', [ 'dist' ]);

}
