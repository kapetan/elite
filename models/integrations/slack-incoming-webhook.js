var request = require('request');
var ejs = require('ejs');

var text = ejs.compile('<%- winner %> <%- winner_score %> - <%- loser_score %> <%- loser %>');
var victory = ejs.compile('<%- winner %> takes another victory over <%- loser %>.');
var draw = ejs.compile('<%- winner %> and <%- loser %> tie.');

var template = function(template, match) {
	return template({
		winner: match.winner.user.name,
		loser: match.loser.user.name,
		winner_score: match.winner.score,
		loser_score: match.loser.score
	});
};

module.exports = function(league, match, data, callback) {
	var payload = JSON.stringify({
		text: template(text, match),
		attachments: [
			{
				fallback: template(text, match),
				title: league.name,
				text: match.draw ? template(draw, match) : template(victory, match)
			}
		]
	});

	request.post({
		url: data.webhook,
		form: { payload: payload },
		pool: false,
		jar: false
	}, function(err, response) {
		if(err) return callback(err);
		if(!(/2\d\d/).test(response.statusCode)) return callback(new Error('Non-success status code'));
		callback();
	});
};
