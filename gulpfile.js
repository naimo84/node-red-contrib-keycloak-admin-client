var gulp = require("gulp");
var ts = require("gulp-typescript");
var sourcemaps = require('gulp-sourcemaps');
var nodemon = require('gulp-nodemon');
var watch = require('gulp-watch');
var merge = require('merge-stream');
var paths = {
    pages: ['src/*.html'],
    src: 'src',
    dist: 'dist'
};

function copyHtml() {
    gulp.src('src/*.svg', { base: paths.src })
        .pipe(gulp.dest(paths.dist+'/icons'))

    return gulp.src(paths.pages, { base: paths.src })
        .pipe(gulp.dest(paths.dist));
}

gulp.task("copy-html", copyHtml);

gulp.task('develop', function (done) {
    var stream = nodemon({
        legacyWatch: true,
        exec: 'node --inspect=9229 --preserve-symlinks      --experimental-modules       --trace-warnings     /usr/lib/node_modules/node-red/red.js',
        ext: '*.ts',
        watch: [paths.src],
        ignore: ["*.map"],
        done: done,
        verbose: true,
        delay: 2000,
        env: { "NO_UPDATE_NOTIFIER": "1" }
    });
    var tsProject = ts.createProject("tsconfig.json");

    copyHtml();
    tsProject.src()
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .js
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(paths.dist));

    watch(paths.pages).on('change', () => {
        copyHtml();
        stream.emit('restart', 10)
    });

    watch('src/*.ts').on('change', () => {
        var tsProject = ts.createProject("tsconfig.json")

        var tsResult = gulp.src(['src/**/*.ts'])
            .pipe(sourcemaps.init())
            .pipe(tsProject());
        stream.emit('restart', 10)
        return merge(tsResult, tsResult.js)
            .pipe(sourcemaps.write('.'))
            .pipe(gulp.dest(paths.dist));
    });

    stream
        .on('restart', function () {
            console.log('restarted!')
        })
        .on('crash', function () {
            console.error('Application has crashed!\n')
            stream.emit('restart', 10)  // restart the server in 10 seconds
        })
})

gulp.task("default", gulp.series(
    gulp.parallel('copy-html'),
    () => {
        var tsProject = ts.createProject("tsconfig.json");

        return tsProject.src()
            .pipe(sourcemaps.init())
            .pipe(tsProject())
            .js
            .pipe(sourcemaps.write('.'))
            .pipe(gulp.dest(paths.dist));
    })
);