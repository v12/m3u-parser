'use strict'

const fs = require('fs')
const path = require('path')
const async = require('async')
const chai = require('chai')

chai.use(require('chai-as-promised'))

const expect = chai.expect

const parse = require('../src/m3u').parse

describe('M3U playlist parser', function () {
  before(function (done) {
    const playlistDir = path.resolve(__dirname, 'playlists')

    fs.readdir(playlistDir, (err, files) => {
      if (err) {
        done(err)
        return
      }

      async.map(files,
        (file, cb) => fs.readFile(path.resolve(playlistDir, file), cb),
        (err, filesContent) => {
          if (err) {
            done(err)
            return
          }

          this.files = {}
          files.forEach((filename, i) =>
            (this.files[filename.replace(/\.m3u(8)?$/, (s, e) => e ? '.ext' : '')] = filesContent[i]))

          done()
        })
    })
  })

  it('should throw when no arguments were specified', function () {
    expect(parse).to.throw(Error)
  })

  it('should be rejected when invalid data passed', function () {
    const invalidPlaylists = [
      undefined,
      123,
      this.files['invalid.ext'],
      this.files['invalid-extinf.ext'],
      this.files['invalid-noextinf.ext'],
      this.files['invalid-duration.ext'],
      this.files['invalid-no-items.ext'],
      '#EXTM3U\n\ninvalid',
      '#EXTENDED_M3U'
    ]

    return Promise.all(invalidPlaylists.map(data => expect(parse(data, { strict: true })).to.be.eventually.rejected))
  })

  it('should return empty array when empty playlist is provided', function () {
    return expect(parse('')).to.eventually.have.length(0)
  })

  it('should call callback function when done', function (done) {
    parse(this.files['simple.ext'], done)
  })

  it('should call callback function when error happens', function (done) {
    parse(this.files['invalid.ext'], err => {
      done(err instanceof Error ? null : new Error('Callback didn\'t fire with error'))
    })
  })

  describe('simple format', function () {
    it('should be parsed properly', function () {
      return parse(this.files['simple']).then(function (data) {
        expect(data).to.have.length(7)
        expect(data[4]).to.deep.equal({
          file: '..\\Other Music\\Bar.mp3',
          duration: null,
          title: null
        })
      })
    })

    describe('with comments', function () {
      it('should be parsed properly', function () {
        return parse(this.files['simple-with-comment']).then(function (data) {
          expect(data).to.have.length(7)
          expect(data[4]).to.deep.equal({
            file: '..\\Other Music\\Bar.mp3',
            duration: null,
            title: null
          })
        })
      })
    })
  })

  describe('extended format', function () {
    it('should return array with playlist items', function () {
      return parse(this.files['simple.ext']).then(function (data) {
        expect(data).to.be.an.instanceOf(Array)
        expect(data[0]).to.be.deep.equal({
          duration: 123,
          title: 'Sample artist - Sample title',
          file: 'Sample.mp3'
        })
      })
    })

    it('should parse EXTINF attributes', function () {
      return parse(this.files['simple.ext']).then(function (data) {
        expect(data[5]).to.be.deep.equal({
          duration: -1,
          title: 'Some Interesting Stream',
          file: 'http://example.org/livestream.mp4',
          attributes: {
            'tvg-id': 'test_id_1',
            'tvg-name': 'Some Stream',
            'channel-id': '1'
          }
        })
      })
    })

    it('should parse negative duration properly', function () {
      return expect(parse(this.files['simple.ext'])).to.eventually.have.deep.property('[4].duration', -1)
    })

    it('should handle unknown tags', function () {
      return expect(parse(this.files['unknown-tag.ext'])).to.eventually.deep.equal([{
        duration: 123,
        title: 'Sample artist - Sample title',
        file: 'Sample.mp3',
        '#EXTGRP': 'Test group'
      }
      ])
    })

    describe('tag #EXT-X-BYTERANGE', function () {
      it('should be parsed for each playlist item', function () {
        return expect(parse(this.files['x-byterange.ext'])).to.be.eventually.deep.equal([{
          duration: 0,
          title: 'Some Stream',
          file: 'http://example.com/stream.mp4',
          byteRange: { length: 100, offset: 222 }
        }, {
          duration: 1233,
          title: 'Another stream',
          file: 'http://example.com/stream.webm',
          byteRange: { length: 33 }
        }])
      })

      it('should have valid format', function () {
        return expect(parse('#EXTM3U\n#EXTINF:0,Some' +
          ' Stream\n#EXT-X-BYTERANGE:wow@222\nhttp://example.com/stream.mp4')).to.be.eventually
          .rejectedWith(Error, 'Invalid format of #EXT-X-BYTERANGE')
      })
    })

    describe('tag #EXT-X-VERSION', function () {
      it('should be parsed and exposed as an own property of the playlist array', function () {
        return expect(parse(this.files['live.ext'])).to.eventually.have.ownProperty('version')
          .and.property('version').equals(3)
      })

      it('should appear only once in a playlist EXT-X-VERSION', function () {
        return expect(parse('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-VERSION:4')).to.be.eventually
          .rejectedWith(Error, 'EXT-X-VERSION tag must appear only once in the playlist')
      })

      it('should have valid integer value', function () {
        return expect(parse('#EXTM3U\n#EXT-X-VERSION:shit')).to.be.eventually
          .rejectedWith(Error, 'Invalid format of #EXT-X-VERSION')
      })
    })

    describe('tag #EXT-X-KEY', function () {
      it('should be parsed and applied to every Media Segment that appears between it and the next EXT-X-KEY' +
        ' tag in the Playlist file with the same KEYFORMAT attribute', function () {
        return parse(this.files['encrypted-segments.ext']).then(data => {
          expect(data[0]).to.have.property('key')
          expect(data[3]).to.have.property('key')

          expect(data[0].key).to.deep.equal({
            method: 'AES-128',
            uri: 'https://priv.example.com/key.php?r=52'
          })
          expect(data[3].key).to.deep.equal({
            method: 'AES-128',
            uri: 'https://priv.example.com/key.php?r=53'
          })
        })
      })

      it('should be parsed and applied to every Media Segment the end of the Playlist file')
    })

    describe('tag #EXT-X-MAP', function () {
      it('should be parsed and applied to every Media Segment until the next EXT-X-MAP tag')

      it('should be parsed and applied to every Media Segment until the end of the Playlist file', function () {
        return parse(this.files['x-map.ext']).then(data => {
          data.forEach(item => {
            expect(item).to.have.property('map')
            expect(item.map).to.deep.equal({
              uri: 'main.mp4',
              byterange: { length: 560, offset: 0 }
            })
          })
        })
      })
    })

    describe('tag #EXT-X-DISCONTINUITY', function () {
      it('should reset continuous attributes')
    })

    describe('tag #EXT-X-PROGRAM-DATE-TIME', function () {
      it('should be parsed and applied to media segment')
    })

    describe('tag #EXT-X-DATERANGE', function () {
      it('should be parsed and applied to media segment')
    })
  })
})
