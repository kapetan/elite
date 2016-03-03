var fs = require('fs');
var path = require('path');
var qs = require('querystring');
var crypto = require('crypto');
var root = require('root');
var send = require('send');
var ejs = require('ejs');
var cookie = require('cookie');
var errors = require('httperrors');
var gravatar = require('gravatar');

var User = require('./models/user');
var League = require('./models/league');
var Match = require('./models/match');

var PORT = process.env.PORT || 20202;
var ENV = process.env.NODE_ENV || 'development';
var SECRET = process.env.SECRET || 'secret';

var app = root();

app.use('response.render', function(filename, locals) {
	var self = this;
	var filepath = path.join(__dirname, 'views', filename);

	fs.readFile(filepath, 'utf-8', function(err, content) {
		if(err) return self.error(err);

		content = ejs.render(content, locals, {
			filename: filepath,
			cache: ENV === 'production'
		});

		self.send(content);
	});
});

app.use('request.session', { getter: true }, function() {
	var cookies = this.headers.cookie;
	cookies = cookies ? cookie.parse(cookies) : null;
	var session = cookies && cookies.session;

	if(session) {
		var decipher = crypto.createDecipher('aes256', SECRET);

		try {
			session = decipher.update(session, 'hex', 'utf-8');
			session += decipher.final('utf-8');
		} catch(err) {
			session = null;
		}

		return session;
	}
});

app.use('response.session', { setter: true }, function(value) {
	var session = null;

	if(value) {
		var cipher = crypto.createCipher('aes256', SECRET);
		session = cipher.update(String(value), 'utf-8', 'hex');
		session += cipher.final('hex');
		session = cookie.serialize('session', session, { path: '/' });
	}
	else {
		session = cookie.serialize('session', 'null', {
			path: '/',
			expires: new Date(0)
		});
	}

	this.setHeader('Set-Cookie', session);
});

app.get('/css/*', function(req, res, next) {
	send(req, req.params['*'], { root: path.join(__dirname, 'css') }).pipe(res);
});

app.get('/accounts/signin', function(req, res, next) {
	res.render('signin.html');
});

app.post('/accounts/signin', function(req, res, next) {
	req.on('form', function(body) {
		User.find({ email: body.email }, function(err, user) {
			if(err) return next(err);

			user.authenticate(body.password, function(err, authenticated) {
				if(err) return next(err);
				if(!authenticated) return next(errors.Unauthorized('Invalid credentials'));

				res.session = user.id;
				res.redirect('/leagues');
			});
		});
	});
});

app.get('/accounts/signup', function(req, res, next) {
	res.render('signup.html');
});

app.post('/accounts/signup', function(req, res, next) {
	req.on('form', function(body) {
		User.create(body, function(err, user) {
			if(err) return next(err);
			res.redirect('/accounts/signin');
		});
	});
});

app.get('/accounts/signout', function(req, res, next) {
	res.session = null;
	res.redirect('/accounts/signin');
});

app.all(function(req, res, next) {
	var id = req.session;
	if(!id) return next();

	User.find({ id: id }, function(err, user) {
		if(err) return next(err);

		req.user = user;
		next();
	});
});

app.all(function(req, res, next) {
	if(!req.user) return res.redirect('/accounts/signin');
	next();
});

app.all('/leagues/{league}/*', function(req, res, next) {
	League.find({ id: req.params.league }, function(err, league) {
		if(err) return next(err);

		req.league = league;
		next();
	});
});

app.get('/accounts/settings', function(req, res, next) {
	var error = ('error' in req.query);
	var success = ('success' in req.query);

	res.render('settings.html', {
		user: req.user,
		error: error,
		success: success
	});
});

app.post('/accounts/settings', function(req, res, next) {
	req.on('form', function(body) {
		var user = req.user;

		user.authenticate(body.current_password, function(err, authenticated) {
			if(err) return next(err);
			if(!authenticated) return next(errors.Unauthorized());

			User.update(user.id, body, function(err) {
				if(err) return next(err);
				res.redirect('/accounts/settings?success=1');
			});
		});
	});
});

app.get('/leagues', function(req, res, next) {
	League.all(function(err, leagues) {
		if(err) return next(err);

		var create = ('create' in req.query);
		var error = ('error' in req.query);

		res.render('leagues.html', {
			user: req.user,
			leagues: leagues,
			create: create,
			error: error
		});
	});
});

app.post('/leagues', function(req, res, next) {
	req.on('form', function(body) {
		League.create(body, req.user, function(err, league) {
			if(err) return next(err);
			res.redirect('/leagues');
		});
	});
});

app.get('/leagues/{league}/rankings', function(req, res, next) {
	var league = req.league;

	Match.rankings(league, function(err, rankings) {
		if(err) return next(err);

		var create = ('create' in req.query);
		var error = ('error' in req.query);

		var unranked = league.participants.filter(function(participant) {
			return rankings.every(function(ranking) {
				return ranking.user.id !== participant.id;
			});
		});

		res.render('rankings.html', {
			user: req.user,
			league: league,
			rankings: rankings,
			unranked: unranked,
			create: create,
			error: error
		});
	});
});

app.post('/leagues/{league}/rankings', function(req, res, next) {
	req.on('form', function(body) {
		var league = req.league;
		var isOwner = league.findOwner(req.user);

		if(!isOwner) return next(errors.Forbidden('Only league owners can add participants'));

		User.find({ email: body.email }, function(err, user) {
			if(err) return next(err);

			League.addParticipant(league.id, user, function(err) {
				if(err) return next(err);
				res.redirect('/leagues/' + league.id + '/rankings');
			});
		});
	});
});

app.get('/leagues/{league}/matches', function(req, res, next) {
	var league = req.league;

	Match.all({ league_id: league.id }, 'desc', function(err, matches) {
		if(err) return next(err);

		var create = ('create' in req.query);
		var error = ('error' in req.query);

		res.render('matches.html', {
			user: req.user,
			league: league,
			matches: matches,
			create: create,
			error: error
		});
	});
});

app.post('/leagues/{league}/matches', function(req, res, next) {
	req.on('form', function(body) {
		if(Array.isArray(body.scores)) body.scores = body.scores.map(parseFloat);
		if(!Match.valid(body)) return next(errors.UnprocessableEntity('Invalid match data'));

		var user = req.user;
		var league = req.league;
		var isParticipant = league.findParticipant(user);
		var isOwner = league.findOwner(user);

		if(!isParticipant && !isOwner) return next(errors.Forbidden('Only league participants and owners can create matches'));

		var participants = body.participants.map(function(id, i) {
			return {
				user: league.findParticipant(id),
				score: parseInt(body.scores[i], 10)
			};
		});

		var all = participants.every(function(participant) {
			return participant.user;
		});

		if(!all) return next(errors.UnprocessableEntity('Participant not in league'));

		Match.create(participants, league, function(err) {
			if(err) return next(err);
			res.redirect('/leagues/' + league.id + '/matches');
		});
	});
});

app.error('4xx', function(req, res, err) {
	console.error(err.stack || err.message || err);

	var url = req.url;
	var sep = (/\?/.test(url)) ? '&' : '?';

	url = url + sep + qs.stringify({ error: 1 });
	res.redirect(url);
});

app.listen(PORT, function() {
	console.log('Server listening on port', PORT);
});
