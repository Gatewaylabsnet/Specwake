# Public, test-only TLS material

These three PEM files are unchanged public Node.js test fixtures from tag `v24.15.0`:
https://github.com/nodejs/node/tree/v24.15.0/test/fixtures/keys

The signing certificate is CA1, and the server certificate's CN is `agent1` (valid until 2296). The private key has always been public test data. It is **not a real credential** and must never be used for an actual service. No certificate, persistent trust entry or real key was generated or installed for these tests. Only the isolated test client's request is supplied this test CA. Production code has no CA injection, localhost exemption or TLS bypass option.

Node.js contributors and Joyent licensed these fixtures under the MIT license:

Copyright Node.js contributors. All rights reserved.
Copyright Joyent, Inc. and other Node contributors. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
