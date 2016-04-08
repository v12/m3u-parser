(function (root, factory) {
    /* istanbul ignore next */
    if (typeof define === 'function' && define.amd)
        define([], factory);
    else if (typeof module === 'object' && module.exports)
        module.exports = factory();
    else
        root.m3uParser = factory();
}(this, function () {
    'use strict';

    function parse (data, cb) {
        const promise = typeof cb !== 'function',
              resolve = promise ? Promise.resolve.bind(Promise) : (r => cb(null, r)),
              reject  = promise ? Promise.reject.bind(Promise) : cb;

        if (typeof Buffer === 'function' && Buffer.isBuffer(data))
            data = data.toString();
        else if (typeof data !== 'string')
            return reject(new TypeError('Data passed to the parser should be a string'));


        data = data.split('\n').filter(str => str.length > 0);

        if (data.length === 0)
            return resolve([]);

        data[0] = data[0].trim();

        if (data[0][0] === '#') {
            const line = data.shift();
            if (line !== '#EXTM3U')
                return reject(new Error('Unsupported playlist format'));
        } else
            return resolve(data.map(file => ({ file, title: null, duration: null })));


        const buffer = [];
        let line;

        while ((line = data.shift())) {
            line = line.trim();

            if (buffer.length === 0)
                buffer.push({ file: null, title: null, duration: null });

            const item = buffer[buffer.length - 1];

            if (line[0] === '#') {
                if (line.slice(1, 4) === 'EXT') {
                    const colonPos = line.indexOf(':', 4);

                    if (colonPos === -1)
                        return reject(new Error('#EXT tag used but no data provided'));

                    const tagName = line.slice(4, colonPos),
                          value   = line.slice(colonPos + 1).trim();

                    switch (tagName) {
                        case 'INF':
                        {
                            const commaPos = value.lastIndexOf(',');

                            if (commaPos === -1)
                                return reject(new Error('Invalid format of #EXTINF - unable to parse title'));

                            item.title = value.slice(commaPos + 1).trim();

                            let match = /^(-?[0-9]+)/.exec(value);

                            if (!match)
                                return reject(new Error('Invalid format of #EXTINF - unable to parse duration'));

                            item.duration = +match[1];

                            const EXTINF_ATTR_REGEX = / ([A-z0-9_-]+)="(.+?)"/g,
                                  details           = value.slice(match[1].length, commaPos);

                            while ((match = EXTINF_ATTR_REGEX.exec(details)) !== null) {
                                if (!item.hasOwnProperty('attributes'))
                                    item.attributes = {};

                                item.attributes[match[1]] = match[2];
                            }

                            break;
                        }
                        default:
                            item[line.slice(0, colonPos)] = value; // todo get value
                            break;
                    }
                } else {
                    // todo process unknown tags
                }
            } else if (item.file === null && item.title !== null) {
                item.file = line;
                buffer.push({ file: null, title: null, duration: null });
            } else
                return reject(new Error('Invalid data'));
        }


        let item = buffer[buffer.length - 1];

        if (item.title === null && item.duration === null && item.file === null)
            buffer.pop();

        item = buffer[buffer.length - 1];

        if (item.title === null || item.duration === null || item.file === null)
            return reject(new Error('Invalid playlist'));


        return resolve(buffer);
    }

    return { parse };
}));
