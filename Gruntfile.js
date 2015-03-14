module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clean: [ "dist/*.js" ],
		browserify: {
			dist: {
				src: "index.js",
				dest: "dist/application.js",
				options: {
					browserifyOptions: { standalone: "Binkify" }
				}
			},
			dev: {
				src: "index.js",
				dest: "dist/application.dev.js",
				options: {
					browserifyOptions: { debug: true, standalone: "Binkify" }
				}
			}
		},
		wrap2000: {
			dist: {
				src: 'dist/application.js',
				dest: 'dist/application.js',
				options: {
					header: "/*\n * Application Core\n * (c) 2014-2015 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			},
			dev: {
				src: 'dist/application.dev.js',
				dest: 'dist/application.dev.js',
				options: {
					header: "/*\n * Application Core (with Source Maps)\n * (c) 2014-2015 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			}
		},
		uglify: {
			dist: {
				src: "dist/application.js",
				dest: "dist/application.min.js"
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-wrap2000');

	grunt.registerTask('build-dev', [ 'browserify:dev', 'wrap2000:dev' ]);
	grunt.registerTask('build-dist', [ 'browserify:dist', 'wrap2000:dist', 'uglify:dist' ]);

	grunt.registerTask('dev', [ 'clean', 'build-dev' ]);
	grunt.registerTask('dist', [ 'clean', 'build-dist' ]);

	grunt.registerTask('default', [ 'clean', 'build-dist', 'build-dev' ]);

}