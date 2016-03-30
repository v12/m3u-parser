'use strict';

var Promise = require('bluebird');

const EXTINF_REGEX = /^#EXTINF:(-?)(\d+),(.*)$/;
const EXTGRP_REGEX = /^#EXTGRP:(.*)$/;

function parse (data) {
    if (Buffer.isBuffer(data))
        data = data.toString();
    else if (typeof data !== 'string')
        return Promise.reject(new TypeError('Data passed to the parser should be a string'));

    return new Promise(function (resolve, reject) {
        data = data.split('\n').filter(str => str.length > 0);

        if (data.shift().trim() !== '#EXTM3U')
            return reject(new Error('Passed data is not valid M3U playlist'));

        var buffer = [], awaitingLink = false, line;

        while ((line = data.shift())) {
            line = line.trim();

            if (awaitingLink && line.slice(0, 4) !== '#EXT') {
                buffer[buffer.length - 1].file = line;

                awaitingLink = false;
            } else {
                const token = line.slice(0, 7);
                if (token === '#EXTINF') {
                    let result = EXTINF_REGEX.exec(line);
                    if (!result)
                        throw new Error('Invalid #EXTINF data format');

                    buffer.push({
                        title:    result[3].trim(),
                        duration: +(result[1] + result[2].trim())
                    });

                    awaitingLink = true;
                } else if (token === '#EXTGRP') {
                    if (!awaitingLink)
                        throw new Error('#EXTGRP must be used only after #EXTINF');

                    let result = EXTGRP_REGEX.exec(line);
                    if (!result)
                        throw new Error('Invalid #EXTGRP data format');

                    buffer[buffer.length - 1].group = result[1].trim();
                } else {
                    throw new Error('Invalid data');
                }
            }
        }

        resolve(buffer);
    });
}

module.exports.parse = parse;
