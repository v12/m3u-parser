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

    function parse (data, options, cb) {
        if (arguments.length === 0)
            throw new Error('Parser should be called at least with the playlist parameter specified');
        else if (arguments.length === 1) // todo optimize
            options = {};
        else if (arguments.length === 2) {
            if (typeof options === 'function') { // todo optimize
                cb      = options;
                options = {};
            }
        }

        const promise = typeof cb !== 'function',
              resolve = promise ? Promise.resolve.bind(Promise) : (r => cb(null, r)),
              reject  = promise ? Promise.reject.bind(Promise) : cb;

        if (typeof Buffer === 'function' && Buffer.isBuffer(data))
            data = data.toString();
        else if (typeof data !== 'string')
            return reject(new TypeError('Data passed to the parser should be a string'));

        data = data.split('\n').filter(str => str.length > 0); // empty lines are ignored

        if (data.length === 0)
            return resolve([]);

        data[0] = data[0].trim(); // trim first line

        let isExtended = false;

        if (data[0][0] === '#') {
            const line = data.shift();

            if (line === '#EXTM3U')
                isExtended = true;
            else if (options.strict && line.slice(1, 4) === 'EXT')
                return reject(new Error('Extended format playlist should start with #EXTM3U tag'));
        }

        if (!isExtended)
            return resolve(data.filter(line => line[0] !== '#').map(file => ({ file, title: null, duration: null })));

        const buffer = [];
        let line;

        while ((line = data.shift())) {
            line = line.trim();

            if (buffer.length === 0)
                buffer.push({ file: null, title: null, duration: null });

            const item = buffer[buffer.length - 1];

            if (line[0] === '#' && line.slice(1, 4) === 'EXT') { // process only tags, ignore comments
                const colonPos = line.indexOf(':', 4);

                if (colonPos === -1)
                    return reject(new Error('#EXT tag used but no data provided'));

                const tagName = line.slice(4, colonPos),
                      value   = line.slice(colonPos + 1).trim();

                switch (tagName) {
                    /*
                     #EXT-X-VERSION:<n>

                        <n> is an integer indicating the protocol compatibility version number

                        A Playlist file MUST NOT contain more than one EXT-X-VERSION tag.
                     */
                    case '-X-VERSION':
                        if (buffer.hasOwnProperty('version'))
                            return reject(new Error('EXT-X-VERSION tag must appear only once in the playlist'));

                        if (!isFinite(value))
                            return reject(new Error('Invalid format of #EXT-X-VERSION - unable to parse'));

                        buffer.version = +value;

                        break;

                    /*
                     #EXTINF:<duration>,[<title>]

                         <duration> is a decimal-floating-point or decimal-integer number
                         <title> is an optional human-readable informative title of the Media Segment expressed as raw
                          UTF-8 text
                     */
                    case 'INF':
                    {
                        const commaPos = value.lastIndexOf(',');

                        if (commaPos === -1)
                            return reject(new Error('Invalid format of #EXTINF - unable to parse title'));

                        item.title = value.slice(commaPos + 1).trim();

                        let match = /^(-?\d+)/.exec(value);

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

                    /*
                     #EXT-X-BYTERANGE:<n>[@<o>]

                        <n> is a decimal-integer indicating the length of the sub-range in bytes
                        <o> is a decimal-integer indicating the start of the sub-range, as a byte offset from the
                         beginning of the resource.

                        Use of the EXT-X-BYTERANGE tag REQUIRES a compatibility version number of 4 or greater.
                     */
                    case '-X-BYTERANGE':
                        let match = /^(\d+)(@(\d+))?/.exec(value); // todo simple string token (@) split?

                        if (!match)
                            return reject(new Error('Invalid format of #EXT-X-BYTERANGE - unable to parse'));

                        item.byteRange = { length: +match[1] };

                        if (match[3])
                            item.byteRange.offset = +match[3];

                        break;

                    /*
                     #EXT-X-DISCONTINUITY

                        Indicates a discontinuity between the Media Segment that follows it and the one that
                         preceded it.
                     */
                    case '-X-DISCONTINUITY':

                    /*
                     #EXT-X-KEY:<attribute-list>
                        It applies to every Media Segment that appears between it and the next EXT-X-KEY tag in the
                         Playlist file with the same  KEYFORMAT attribute (or the end of the Playlist file).  Two or
                         more EXT-X-KEY tags with different KEYFORMAT attributes MAY apply to the same Media Segment
                         if they ultimately produce the same decryption key.

                        The following attributes are defined:
                            - METHOD is an enumerated-string that specifies the encryption method (REQUIRED)
                                The methods defined are: NONE, AES-128, and SAMPLE-AES.
                                An encryption method of NONE means that Media Segments are not encrypted. If the
                                encryption method is NONE, other attributes MUST NOT be present.
                            - URI is a quoted-string
                            - IV is a hexadecimal-sequence that specifies a 128-bit unsigned integer Initialization
                                Vector to be used with the key
                            - KEYFORMAT is a quoted-string
                            - KEYFORMATVERSIONS is a quoted-string containing one or more positive integers separated by
                                the "/" character
                     */
                    case '-X-KEY':

                    /*
                     #EXT-X-MAP:<attribute-list>
                        It applies to every Media Segment that appears after it in the Playlist until the next
                         EXT-X-MAP tag or until the end of the playlist.

                        The following attributes are defined:
                            - URI is a quoted-string (REQUIRED)
                            - BYTERANGE is a quoted-string
                     */
                    case '-X-MAP':

                    /*
                     #EXT-X-PROGRAM-DATE-TIME:<YYYY-MM-DDThh:mm:ssZ>

                        It applies only to the next Media Segment

                        The date/time representation is ISO/IEC 8601:2004
                     */
                    case '-X-PROGRAM-DATE-TIME':

                    /*
                     #EXT-X-DATERANGE:<attribute-list>

                        - ID (REQUIRED) is a quoted-string
                        - CLASS is a quoted-string
                        - START-DATE is a quoted-string containing the ISO-8601 date
                        - END-DATE is a quoted-string containing the ISO-8601 date
                        - DURATION is a decimal-floating-point number of seconds. It MUST NOT be negative.
                        - PLANNED-DURATION is a decimal-floating-point number of seconds. It MUST NOT be negative.
                        - X-<client-attribute> value MUST be a quoted-string, a hexadecimal-sequence, or a
                         decimal-floating-point
                        - SCTE35-CMD, SCTE35-OUT, SCTE35-IN
                        - END-ON-NEXT is an enumerated-string whose value MUST be YES

                     */
                    case '-X-DATERANGE':
                        console.info('[m3u-parser] #EXT' + tagName + ' processing is not yet implemented');

                        break;

                    default:
                        item[line.slice(0, colonPos)] = value; // todo get value

                        break;
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
