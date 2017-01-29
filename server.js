var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');
var redisLib = require('redis');
var ejs = require('ejs');
var multer  = require('multer');
var multerS3 = require('multer-s3');
var aws = require('aws-sdk');
var uuid = require('uuid/v4');

var app = express();
app.use(bodyParser.json());

/* Redis struct: {
    <uuid/v4>_title: "Tom's Birthday"
    <uuid/v4_images: ["<uuid/v4>", "<uuid/v4>"]
} */
var redis = redisLib.createClient(process.env.REDIS_URL);
var titleSuffix = "_title";
var imagesSuffix = "_images";

var indexPage = ejs.compile(fs.readFileSync(__dirname + '/pages/index.html', 'utf-8'));
var galleryPage = ejs.compile(fs.readFileSync('pages/gallery.html', 'utf-8'));
var newPage = ejs.compile(fs.readFileSync('pages/new.html', 'utf-8'));

var upload = multer({
    storage: multerS3({
        s3: new aws.S3({
            accessKeyId: process.env.AWS_AK,
            secretAccessKey: process.env.AWS_SK,
            region: "eu-west-1"
        }),
        bucket: 'jollycards-static',
        acl: 'public-read',
        key: function (req, file, cb) {
            var imageName = uuid() + ".png";
            redis.rpush(req.params.eventId + imagesSuffix, imageName, function(err, reply) {
                if (err) {
                    console.error(err);
                }

                cb(null, imageName);
            });
        }
    })
}).single('image');

var s3url = 'https://s3-eu-west-1.amazonaws.com/jollycards-static/';

app.get('/', function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(indexPage());
});

app.get('/:eventId', function(req, res) {
    redis.get(req.params.eventId + titleSuffix, function(err, title) {
        if (title) {
            redis.get(req.params.eventId + imagesSuffix, function(err, values) {
                var images = '';

                if (values) {
                    for (var i = 0; i < values.length; i++) {
                        images += "<img src=\"" + s3url + values[i] + "\" class=\"m-p-g__thumbs-img\" />\n";
                    }
                }

                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(galleryPage({ event: title, images: images }));
            });
        } else {
            res.status(404).send('Event Not Found');
        }
    });
});

app.get('/:eventId/new', function(req, res) {
    redis.get(req.params.eventId + titleSuffix, function(err, title) {
        if (title) {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(newPage({ event: title, eventId: req.params.eventId }));
        } else {
            res.status(404).send('Event Not Found');
        }
    });
});

/* JSON struct: {
    eventName: ""
} */
app.post('/api/event/new', function(req, res) {
    if (req.body.eventName) {
        var eventId = uuid();
        var images = [];
        redis.set(eventId + titleSuffix, req.body.eventName, function(err, reploy) {
            if (err) {
                res.status(500).json({ message: 'Internal Error' });
                return;
            }

            redis.set(eventId + imagesSuffix, images, function(err, reply) {
                if (err) {
                    res.status(500).json({ message: 'Internal Error' });
                    return;
                }

                res.status(200).json({ message: 'Success', eventId: eventId });
            });
        });
    } else {
        res.status(400).json({ message: 'Bad Request' });
    }
});

app.post('/api/event/upload/:eventId', function(req, res) {
    upload(req, res, function(err) {
        if (err) {
            res.status(500).json({ message: 'Internal Error' });
            return;
        }

        res.status(200).json({ message: 'Success' });
    });
});

app.get('*', function(req, res) {
    res.status(404).send('404 Page Not Found');
});

app.listen(process.env.PORT || 8080);
