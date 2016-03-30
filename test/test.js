'use strict';

var fs   = require('fs');
var chai = require('chai');

chai.use(require('chai-as-promised'));
chai.should();

var m3u = require('../m3u');

var files = ['extended', 'invalid_extended', 'extended_with_extgrp']
    .map(filename => fs.readFileSync(__dirname + '/playlists/' + filename + '.m3u'));

describe('M3U playlist parser', function () {
    it('should be rejected when invalid data passed', function () {
        return Promise.all([
            m3u.parse().should.eventually.be.rejected,
            m3u.parse(123).should.eventually.be.rejected,
            m3u.parse('invalid').should.eventually.be.rejected,
            m3u.parse(files[1]).should.eventually.be.rejected,
            m3u.parse('#EXTM3U\n\ninvalid').should.eventually.be.rejected
        ]);
    });

    describe('extended format', function () {
        it('should return array with playlist items', function () {
            return m3u.parse(files[0]).then(function (data) {
                data.should.be.an.instanceOf(Array);
                data.should.have.length(5);
                data[0].should.be.deep.equal({
                    duration: 123,
                    file:     'Sample.mp3',
                    title:    'Sample artist - Sample title'
                });
            });
        });

        it('should parse negative duration properly', function () {
            return m3u.parse(files[0]).should.be.eventually.fulfilled
                .and.have.deep.property('[4].duration', -1);
        });

        describe('with non-standard tokens', function () {
            it('should process #EXTGRP', function () {
                return m3u.parse(files[2]).then(function (data) {
                    data[1].should.have.property('group', 'Comedy');
                });
            });
        });
    });
});
