module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clean: [ "dist/*.js" ],
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
			dist: {
				src: 'dist/appcore.js',
				dest: 'dist/appcore.js',
				options: {
					header: "/*\n * Appcore \n * (c) 2014-2015 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			},
			dev: {
				src: 'dist/appcore.dev.js',
				dest: 'dist/appcore.dev.js',
				options: {
					header: "/*\n * Appcore (with Source Maps)\n * (c) 2014-2015 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
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
