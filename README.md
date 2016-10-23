# elite

A small web application for recording match scores. It uses the [Elo rating system](https://en.wikipedia.org/wiki/Elo_rating_system) to produce the player ranking list.

Configuration
=============

The following environment variable can be set.

- `PORT` The port number which the HTTP server listens on (default `20202`).
- `NODE_ENV` Node environment. Set to `production` on production servers (default `development`).
- `DATABASE_URL` The PostgreSQL database URL (default `postgres://127.0.0.1/elite`).
- `SECRET` The HTTP cookie secret used to encrypt and decrypt the session cookie (default `secret`).

Start
=====

	npm run db:create

Creates the necessary tables in the database. Make sure the PostgreSQL server is running, that the database exists and that `DATABASE_URL` points at the correct server.

	npm start

Start the server.
