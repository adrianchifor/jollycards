var fs = require('fs');
var express = require('express');
var redisLib = require('redis');
var ejs = require('ejs');
var multer  = require('multer');
var uuid = require('uuid/v4');

var app = express();

var redis = redisLib.createClient(process.env.REDIS_URL);

var galleryPage = ejs.compile(fs.readFileSync('pages/gallery.html', 'utf-8'));
var newPage = ejs.compile(fs.readFileSync('pages/new.html', 'utf-8'));

var storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, '/static');
    },
    filename: function(req, file, cb) {
        var imageName = uuid();

        redis.get(req.params.event, function(err, values) {
            if (values) {
                redis.rpush(req.params.event, imageName);
            } else {
                var images = [];
                images.push(imageName);
                redis.set(req.params.event, images);
            }

            cb(null, imageName);
        });
    }
});

var upload = multer({ storage: storage }).single('image');

var url = 'http://jollycards.dokku.adrianchifor.com';
var uploadToken = 'G9qIw6rb0Zo5325r8irkCBV6Gku874';

app.use('/', express.static(__dirname + '/pages'));
app.use('/static', express.static('/static'));

app.get('/:event', function(req, res) {
    redis.get(req.params.event, function(err, values) {
        var images = '';
        if (values) {
            for (var i = 0; i < values.length; i++) {
                images += "<img src=\"" + url + "/static/" + values[i] + "\" class=\"m-p-g__thumbs-img\" />\n";
            }
        }

        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(galleryPage({ event: req.params.event.replace(/\+/g, ' '), images: images }));
    });
});

app.get('/:event/new', function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(newPage({ event: req.params.event.replace(/\+/g, ' '), token: uploadToken }));
});

app.post('/:event/upload/:token', function(req, res) {
    if (req.params.token === uploadToken) {
        upload(req, res, function(err) {
            if (err) {
                res.status(500).send('Internal Error');
                return;
            }

            res.status(200).send('Success');
        });
    }

    res.status(401).send('Unauthorized');
});

app.get('*', function(req, res) {
    res.status(404).send('404 Page Not Found');
});

app.listen(process.env.PORT || 8080);
