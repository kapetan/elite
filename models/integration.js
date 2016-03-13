var extend = require('xtend/mutable');
var errors = require('httperrors');
var through = require('through2');
var pumpify = require('pumpify');
var collect = require('stream-collector');
var find = require('array-find');
var validator = require('is-my-json-valid');
var pick = require('object.pick');
var afterAll = require('after-all');

var db = require('../db');
var types = require('../integrations');
var slackIncomingWebhook = require('./integrations/slack-incoming-webhook');

types.forEach(function(type) {
	type.valid = validator(type.schema);
	type.fields = Object.keys(type.schema.properties);

	if(type.id === 0) type.notify = slackIncomingWebhook;
});

var Integration = function(data) {
	extend(this, data);
};

Integration.find = function(query, callback) {
	Integration.all(query, function(err, integrations) {
		if(err) return callback(err);
		if(!integrations.length) return callback(errors.NotFound('Integration not found'));

		callback(null, integrations[0]);
	});
};

Integration.all = function(query, callback) {
	if(!callback && typeof query === 'function') {
		callback = query;
		query = {};
	}

	var stream = db
		.select('*')
		.from('integrations')
		.where(query)
		.orderBy('id', 'asc')
		.stream();

	var write = function(data, encoding, callback) {
		var type = find(types, function(t) {
			return t.id === data.type_id;
		});

		data.type = type;

		callback(null, new Integration(data));
	};

	var transform = through.obj(write);
	var pump = pumpify.obj(stream, transform);

	if(callback) collect(pump, callback);
	return pump;
};

Integration.types = function(query, callback) {
	if(!callback && typeof query === 'function') {
		callback = query;
		query = {};
	}

	Integration.all(query, function(err, integrations) {
		if(err) return callback(err);

		integrations = types.map(function(t) {
			var i = find(integrations, function(i) {
				return i.type_id === t.id;
			});

			t = Object.create(t);
			t.data = i ? i.data : {};
			return t;
		});

		callback(null, integrations);
	});
};

Integration.upsert = function(type, data, league, callback) {
	type = parseInt(type, 10);
	type = find(types, function(t) {
		return t.id === type;
	});

	if(!type) return callback(errors.NotFound('Integration type not found'));

	data = pick(data, type.fields);

	if(!type.valid(data)) return callback(errors.UnprocessableEntity('Invalid integration data'));

	var now = new Date();

	var onfinish = function(rows) {
		data = rows[0];
		data.type = type;

		callback(null, new Integration(data));
	};

	var update = function() {
		db('integrations')
			.update({
				data: data,
				updated_at: now
			})
			.where({ league_id: league.id, type_id: type.id })
			.returning('*')
			.asCallback(function(err, rows) {
				if(err) return callback(err);
				onfinish(rows);
			});
	};

	db
		.insert({
			league_id: league.id,
			type_id: type.id,
			data: data,
			created_at: now,
			updated_at: now
		})
		.into('integrations')
		.returning('*')
		.asCallback(function(err, rows) {
			if(err) {
				// Unique constraint violation
				if(err.code === '23505') update();
				else callback(err);
				return;
			}

			onfinish(rows);
		});
};

Integration.notify = function(query, league, match, callback) {
	if(!callback && typeof match === 'function') return Integration.notify({}, league, match, callback);

	Integration.all(query, function(err, integrations) {
		if(err) return callback(err);

		var next = afterAll(callback);

		integrations.forEach(function(integration) {
			integration.type.notify(league, match, integration.data, next());
		});
	});
};

module.exports = Integration;
