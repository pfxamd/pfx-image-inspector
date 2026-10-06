# Third-Party Notices

## exifr

PFx Image Inspector uses `exifr` as an internal metadata-reading adapter.

- Project: exifr
- Version range: ^7.1.3
- Author: Mike Kovařík
- License: MIT

MIT License

Copyright (c) 2020 Mike Kovařík, Mutiny.cz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE.

Development tooling remains subject to the licenses published by each package.

## Reference corpus

The optional reference corpus downloader uses selected test fixtures from
`MikeKovarik/exifr`, pinned to commit
`6cbf6e921688faf7723e1f2e0b9e672d1f0aa21c`.

The upstream repository is MIT-licensed. The fixture bytes are downloaded only
for validation and are not committed into this repository. Their Git blob SHA
and expected size are verified before use.
