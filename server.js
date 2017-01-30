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
app.use(bodyParser.urlencoded({ extended: true }));

/* Redis struct: {
    <uuid/v4>_title: "Tom's Birthday"
    <uuid/v4_images: ["<uuid/v4>", "<uuid/v4>"]
} */
var redis = redisLib.createClient(process.env.REDIS_URL);
var titleSuffix = "_title";
var imagesSuffix = "_images";

var indexPage = ejs.compile(fs.readFileSync(__dirname + '/pages/index.html', 'utf-8'));
var galleryPage = ejs.compile(fs.readFileSync(__dirname + '/pages/gallery.html', 'utf-8'));
var newPage = ejs.compile(fs.readFileSync(__dirname + '/pages/new.html', 'utf-8'));

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
            var key = req.params.eventId + imagesSuffix;
            var imageName = uuid() + ".png";

            redis.sadd([key, imageName], function(err, reply) {
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
    var keyTitle = req.params.eventId + titleSuffix;
    var keyImages = req.params.eventId + imagesSuffix;

    redis.get(keyTitle, function(err, title) {
        if (title) {
            redis.smembers(keyImages, function(err, values) {
                var images = '';

                if (values) {
                    for (var i = 0; i < values.length; i++) {
                        images += s3url + values[i];

                        if (i < values.length - 1) {
                            images += ",";
                        }
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
    var key = req.params.eventId + titleSuffix;
    redis.get(key, function(err, title) {
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
        var key = eventId + titleSuffix;

        redis.set(key, req.body.eventName, function(err, reploy) {
            if (err) {
                console.error(err);
                res.status(500).json({ status: 500, message: 'Internal Error' });
                return;
            }

            res.status(200).json({ status: 200, message: 'Success', eventId: eventId });
        });
    } else {
        res.status(400).json({ status: 400, message: 'Bad Request' });
    }
});

app.post('/api/event/upload/:eventId', function(req, res) {
    upload(req, res, function(err) {
        if (err) {
            res.status(500).json({ status: 500, message: 'Internal Error' });
            return;
        }

        res.status(200).json({ status: 200, message: 'Success' });
    });
});

app.get('*', function(req, res) {
    res.status(404).send('404 Page Not Found');
});

app.listen(process.env.PORT || 8080);
