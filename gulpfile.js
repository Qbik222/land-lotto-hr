'use strict';

let gulp = require('gulp')
, sass = require('gulp-sass')(require('sass'))
, concat = require('gulp-concat')
, sourcemaps = require('gulp-sourcemaps')
, gulpIf = require('gulp-if')
, del = require('del')
, pug = require('gulp-pug')
, newer = require('gulp-newer')
, autoprefixer = require('gulp-autoprefixer')
, browserSync = require('browser-sync').create()
, notify = require('gulp-notify')
, plumber = require('gulp-plumber')
, babel = require('gulp-babel')
, cleanCSS = require('gulp-clean-css')
, rename = require('gulp-rename')
, uglify = require('gulp-uglify')
, browserify = require('browserify')
, babelify = require('babelify')
, source = require('vinyl-source-stream')
, buffer = require('vinyl-buffer')
;

 // For Prodaction
    // gulp clean
    // NODE_ENV=production gulp build
    // gulp build --prod

    const isDevelopment = !process.argv[3];
    const isProduction = process.argv[3] === '--prod';

    // const isDevelopment = !isProduction || process.NODE_ENV || 'development';

//SASS
    gulp.task('sass', function(){

        return gulp.src('front/sass/main.sass')
            .pipe(plumber({
                errorHandler: notify.onError()
            }))
            .pipe(gulpIf(isDevelopment, sourcemaps.init()))
            .pipe(sass())
            .pipe(autoprefixer({
                overrideBrowserslist: ['last 16 versions'],
                cascade: false
            }))
            .pipe(gulpIf(isDevelopment, sourcemaps.write()))
            .pipe(gulpIf(isProduction, cleanCSS()))
            .pipe(gulp.dest('build/css'));
    });
//PUG
    gulp.task('pug', function(){

        return gulp.src('front/pug/tempPages/*.pug')
            .pipe(plumber({
                errorHandler: notify.onError()
            }))
            .pipe(gulpIf(isDevelopment, sourcemaps.init()))
            .pipe(pug())
            .pipe(gulpIf(isDevelopment, sourcemaps.write()))
            .pipe(gulp.dest('build'));
    });
//JS
    gulp.task('js', function(){
        return browserify({
            entries: 'front/js/main.js',
            debug: isDevelopment
        })
        .transform(babelify, {
            presets: ['@babel/env']
        })
        .bundle()
        .on('error', notify.onError())
        .pipe(source('main.js'))
        .pipe(buffer())
        .pipe(gulpIf(isDevelopment, sourcemaps.init({loadMaps: true})))
        .pipe(gulpIf(isProduction, uglify()))
        .pipe(gulpIf(isDevelopment, sourcemaps.write('./')))
        .pipe(gulp.dest('build/js'));
    });
//CLEAN
    gulp.task('clean', function(){
        return del('build');
    });

//COPY IMG
    gulp.task('copyImg', function(){
        return gulp.src('front/img/**', {since: gulp.lastRun('copyImg')})
            .pipe(newer(('build/img')))
            .pipe(gulp.dest('build/img'));
    });
//COPY JSONE
    gulp.task('copyJson', function(){
        return gulp.src('front/json/**', {since: gulp.lastRun('copyJson')})
            .pipe(newer(('build/json')))
            .pipe(gulp.dest('build/json'));
    });
//COPY FONTS
    gulp.task('copyFonts', function(){
        return gulp.src('front/fonts/**/*.*', {since: gulp.lastRun('copyFonts')})
            .pipe(newer(('build/fonts')))
            .pipe(gulp.dest('build/fonts'));
    });

//BUILD
    gulp.task('build', gulp.series('clean', gulp.parallel('pug', 'sass', 'js', 'copyFonts', 'copyImg', 'copyJson')));
//STATIC SERVER
    gulp.task('server', function() {
        browserSync.init({
            server: 'build'
        });

        browserSync.watch('build/**/*.*').on('change', browserSync.reload);
    });
//WATCH
    gulp.task('watch', function(){
        gulp.watch('front/pug/**/*.*', gulp.series('pug'));
        gulp.watch('front/sass/**/*.*', gulp.series('sass'));
        gulp.watch('front/js/**/*.*', gulp.series('js'));
        gulp.watch('front/img/**/*.*', gulp.series('copyFonts'));
        gulp.watch('front/img/**/*.*', gulp.series('copyImg'));
        gulp.watch('front/json/**/*.*', gulp.series('copyJson'));
    });
// DEV BUILD
    gulp.task('dev', gulp.series('build', gulp.parallel('watch', 'server')));
