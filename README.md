junction-caps
=============

[Entity Capabilities](http://xmpp.org/extensions/xep-0115.html) middleware built on 
[Junction](http://github.com/jaredhanson/junction) and [Node](http://nodejs.org). This lets you see 
which additional features the user's XMPP client supports (such as audio/video chat, multi user 
chats, avatars, etc.). This middleware also supports Entity Capability extensions as specified in the 
[legacy specification](http://xmpp.org/extensions/xep-0115.html#legacy).

Installation
------------

```
npm install git://github.com/Daniel15/junction-caps.git
```

Usage
-----

To parse entity capabilities, use the `capabilities` middleware:

```javascript
var capabilities = require('junction-caps').capabilities,
	capabilitiesParser = require('junction-caps').capabilitiesParser;
	
var app = junction.create();
app.use(capabilitiesParser());
app.use(capabilities(function(handler) {
	handler.on('capabilities', function(jid, caps) {
		console.log(jid + ' supports Multi-User chat? ' + caps.features.muc + ', XHTML? ' + caps.features.xhtml);
	})
}));
```

`caps.features` will contain a hash of user-friendly names for the most common capabilities, and 
whether the buddy's client supports it. caps.rawFeatures contains a list of all the raw feature
namespaces.

Credits
-------

   - [Daniel Lo Nigro](http://dan.cx/)
   
License
-------

(The MIT License)

Copyright (c) 2013 Daniel Lo Nigro

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
