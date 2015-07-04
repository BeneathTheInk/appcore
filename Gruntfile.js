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
					external: [ "jquery" ],
					browserifyOptions: { standalone: "Appcore" }
				}
			},
			dev: {
				src: "index.js",
				dest: "dist/appcore.dev.js",
				options: {
					external: [ "jquery" ],
					browserifyOptions: { debug: true, standalone: "Appcore" }
				}
			}
		},
		wrap2000: {
			main: {
				files: [{
					expand: true,
					cwd: "dist/",
					src: [ "*.js" ],
					dest: "dist/",
					isFile: true
				}],
				options: {
					header: "/*\n * Appcore \n * (c) 2014-2015 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			}
		},
		uglify: {
			dist: {
				src: "dist/appcore.js",
				dest: "dist/appcore.min.js"
			}
		}
	});

	grunt.loadNpmTasks('grunt-lodash');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-wrap2000');

	grunt.registerTask('setup', [ 'clean', 'lodash' ]);

	grunt.registerTask('build-dev', [ 'browserify:dev' ]);
	grunt.registerTask('build-dist', [ 'browserify:dist', 'uglify:dist' ]);

	grunt.registerTask('dev', [ 'setup', 'build-dev', 'wrap2000' ]);
	grunt.registerTask('dist', [ 'setup', 'build-dist', 'wrap2000' ]);

	grunt.registerTask('default', [ 'setup', 'build-dist', 'build-dev', 'wrap2000' ]);

}
