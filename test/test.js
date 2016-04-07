'use strict';

var fs    = require('fs');
var path  = require('path');
var async = require('async');
var chai  = require('chai');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

const m3u = require('../src/m3u');

describe('M3U playlist parser', function () {
    before(function (done) {
        const playlistDir = path.resolve(__dirname, 'playlists');

        fs.readdir(playlistDir, (err, files) => {
            if (err)
                return done(err);

            async.map(files,
                (file, cb) => fs.readFile(path.resolve(playlistDir, file), cb),
                (err, filesContent) => {
                    if (err)
                        return done(err);

                    this.files = {};
                    files.forEach((filename, i) =>
                        this.files[filename.replace(/\.m3u(8)?$/, (s, e) => e ? '.ext' : '')] = filesContent[i]);

                    done();
                });
        });
    });

    it('should be rejected when invalid data passed', function () {
        return Promise.all([
            expect(m3u.parse()).to.eventually.be.rejected,
            expect(m3u.parse(123)).to.eventually.be.rejected,
            expect(m3u.parse(this.files['invalid.ext'])).to.eventually.be.rejected,
            expect(m3u.parse(this.files['invalid-extinf.ext'])).to.eventually.be.rejected,
            expect(m3u.parse(this.files['invalid-noextinf.ext'])).to.eventually.be.rejected,
            expect(m3u.parse(this.files['invalid-duration.ext'])).to.eventually.be.rejected,
            expect(m3u.parse(this.files['invalid-no-items.ext'])).to.eventually.be.rejected,
            expect(m3u.parse('#EXTM3U\n\ninvalid')).to.eventually.be.rejected,
            expect(m3u.parse('#EXTENDED_M3U')).to.eventually.be.rejected
        ]);
    });

    it('should return empty array when empty playlist is provided', function () {
        return expect(m3u.parse('')).to.eventually.have.length(0);
    });

    describe('simple format', function () {
        it('should be parsed properly', function () {
            return m3u.parse(this.files['simple']).then(function (data) {
                expect(data).to.have.length(7);
                expect(data[4]).to.deep.equal({
                    file:     '..\\Other Music\\Bar.mp3',
                    duration: null,
                    title:    null
                });
            });
        });
    });

    describe('extended format', function () {
        it('should return array with playlist items', function () {
            return m3u.parse(this.files['simple.ext']).then(function (data) {
                expect(data).to.be.an.instanceOf(Array);
                expect(data[0]).to.be.deep.equal({
                    duration: 123,
                    title:    'Sample artist - Sample title',
                    file:     'Sample.mp3'
                });
            });
        });

        it('should parse EXTINF attributes', function () {
            return m3u.parse(this.files['simple.ext']).then(function (data) {
                expect(data[5]).to.be.deep.equal({
                    duration:   -1,
                    title:      'Some Interesting Stream',
                    file:       'http://example.org/livestream.mp4',
                    attributes: {
                        'tvg-id':     'test_id_1',
                        'tvg-name':   'Some Stream',
                        'channel-id': '1'
                    }
                });
            });
        });

        it('should parse negative duration properly', function () {
            return expect(m3u.parse(this.files['simple.ext'])).to.eventually.have.deep.property('[4].duration', -1);
        });

        it('should handle unknown tags', function () {
            return expect(m3u.parse(this.files['unknown-tag.ext'])).to.eventually.deep.equal([
                {
                    duration: 123,
                    title:    'Sample artist - Sample title',
                    file:     'Sample.mp3',
                    '#EXTGRP': 'Test group'
                }
            ]);
        });
    });
});
