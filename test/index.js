'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Stream = require('stream');
const Express = require('express');
const BodyParser = require('body-parser');
const Hapi = require('hapi');
const Hecks = require('..');

// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;

describe('Hecks', () => {

    describe('the hapi plugin', () => {

        it('may be registered multiple times.', (done) => {

            const server = new Hapi.Server();

            server.register([Hecks, Hecks], (err) => {

                expect(err).to.not.exist();
                done();
            });
        });
    });

    describe('"express" handler', () => {

        it('defaults payload and cookie parsing off.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/{expressPath*}',
                    config: {
                        id: 'my-route',
                        handler: { express: Express() }
                    }
                });

                const route = server.lookup('my-route');

                expect(route.settings.payload).to.include({
                    parse: false,
                    output: 'stream'
                });

                expect(route.settings.state.parse).to.equal(false);

                done();
            });
        });

        it('plays nice with express path params.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/some/:descriptor', (req, res) => {

                return res.send(`${req.params.descriptor} smackeroos`);
            });

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/{expressPath*}',
                    config: {
                        handler: { express: app }
                    }
                });

                server.inject('/some/ole', (res) => {

                    expect(res.result).to.equal('ole smackeroos');
                    done();
                });
            });
        });

        it('plays nice with express payload parsing.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.post('/', BodyParser.json(), (req, res) => {

                return res.send(`${req.body.num} big ones`);
            });

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/{expressPath*}',
                    config: {
                        handler: { express: app }
                    }
                });

                server.inject({
                    method: 'post',
                    url: '/',
                    payload: { num: 7 }
                }, (res) => {

                    expect(res.result).to.equal('7 big ones');
                    done();
                });
            });
        });

        it('plays nice with hapi request.setUrl().', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/:num/tiny', (req, res) => {

                return res.send(`${req.params.num} lil ones`);
            });

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/please/{expressPath*}',
                    config: {
                        handler: { express: app }
                    }
                });

                server.ext('onRequest', (request, reply) => {

                    request.setUrl('/please/144/tiny');
                    reply.continue();
                });

                server.inject('/total/junk', (res) => {

                    expect(res.result).to.equal('144 lil ones');
                    done();
                });
            });
        });

        it('routes to empty expressPath.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/', (req, res) => {

                return res.send('ok');
            });

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/prefix/{expressPath*}',
                    config: {
                        handler: { express: app }
                    }
                });

                server.inject('/prefix', (res) => {

                    expect(res.result).to.equal('ok');
                    done();
                });
            });
        });

        it('routes to non-empty expressPath.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/be/okay', (req, res) => {

                return res.send('ok');
            });

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/prefix/{expressPath*}',
                    config: {
                        handler: { express: app }
                    }
                });

                server.inject('/prefix/be/okay', (res) => {

                    expect(res.result).to.equal('ok');
                    done();
                });
            });
        });

        it('routes to full path in absence of expressPath.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/magical/:items', (req, res) => {

                return res.send(`magical ${req.params.items}`);
            });

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: 'get',
                    path: '/magical/{items}',
                    config: {
                        handler: { express: app }
                    }
                });

                server.inject('/magical/beans', (res) => {

                    expect(res.result).to.equal('magical beans');
                    done();
                });
            });
        });

        it('routes with plugin prefix.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/seat/yourself', (req, res) => {

                return res.send('ok');
            });

            const plugin = (srv, opts, next) => {

                srv.route({
                    method: '*',
                    path: '/do/{expressPath*2}',
                    config: {
                        handler: { express: app }
                    }
                });

                next();
            };

            plugin.attributes = { name: 'plugin-x' };

            server.register([
                Hecks,
                {
                    register: plugin,
                    routes: { prefix: '/please' }
                }
            ], (err) => {

                expect(err).to.not.exist();

                server.inject('/please/do/seat/yourself', (res) => {

                    expect(res.result).to.equal('ok');
                    done();
                });
            });
        });

        it('ends response on error, before end.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/', (req, res) => {

                const BadStream = class extends Stream.Readable {
                    _read() {

                        if (this.isDone) {
                            this.push('|');
                            this.push('second');
                            this.push(null);
                            return;
                        }

                        this.push('first');
                        this.isDone = true;
                    }
                };

                const badStream = new BadStream();
                badStream.pipe(res);

                // Error after first chunk of data is written
                badStream.once('data', () => res.emit('error', new Error()));
            });

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/',
                    config: {
                        handler: { express: app }
                    }
                });

                server.inject({
                    method: 'get',
                    url: '/'
                }, (res) => {

                    expect(res.statusCode).to.equal(200);
                    expect(res.result).to.equal('first');
                    done();
                });
            });
        });

        it('ends response on error, after end.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/', (req, res) => {

                const BadStream = class extends Stream.Readable {
                    _read() {

                        if (this.isDone) {
                            this.push('|');
                            this.push('second');
                            this.push(null);
                            return;
                        }

                        this.push('first');
                        this.isDone = true;
                    }
                };

                // Error after response is finished

                res.once('finish', () => {

                    setImmediate(() => res.emit('error', new Error()));
                });

                const badStream = new BadStream();
                badStream.pipe(res);
            });

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/',
                    config: {
                        handler: { express: app }
                    }
                });

                server.inject({
                    method: 'get',
                    url: '/'
                }, (res) => {

                    expect(res.statusCode).to.equal(200);
                    expect(res.result).to.equal('first|second');
                    done();
                });
            });
        });

        it('takes { app } config.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/', (req, res) => {

                return res.send('ok');
            });

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/{expressPath*}',
                    config: {
                        handler: { express: { app } }
                    }
                });

                server.inject('/', (res) => {

                    expect(res.result).to.equal('ok');
                    done();
                });
            });
        });

        it('takes { app, express } config, using the provided express lib internally.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/', (req, res) => {

                return res.send('ok');
            });

            let called = false;
            const express = () => {

                called = true;
                return Express();
            };

            server.register(Hecks, (err) => {

                expect(err).to.not.exist();

                server.route({
                    method: '*',
                    path: '/{expressPath*}',
                    config: {
                        handler: { express: { app, express } }
                    }
                });

                server.inject('/', (res) => {

                    expect(res.result).to.equal('ok');
                    expect(called).to.equal(true);
                    done();
                });
            });
        });
    });

    describe('toPlugin()', () => {

        it('mounts an express app as a hapi plugin.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/', (req, res) => {

                return res.send('ok');
            });

            server.register([
                Hecks.toPlugin(app, 'x')
            ], {
                routes: { prefix: '/x' }
            }, (err) => {

                expect(err).to.not.exist();

                server.inject('/x', (res) => {

                    expect(res.result).to.equal('ok');
                    done();
                });
            });
        });

        it('receives a name for the created plugin.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/', (req, res) => {

                return res.send('ok');
            });

            server.register([
                Hecks.toPlugin(app, 'my-name')
            ], (err) => {

                expect(err).to.not.exist();

                expect(server.registrations['my-name']).to.exist();
                done();
            });
        });

        it('receives attributes for the created plugin.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const app = Express();

            app.get('/', (req, res) => {

                return res.send('ok');
            });

            server.register([
                Hecks.toPlugin(app, { name: 'my-name', version: '4.2.0' })
            ], (err) => {

                expect(err).to.not.exist();

                expect(server.registrations['my-name']).to.contain({
                    name: 'my-name',
                    version: '4.2.0'
                });

                done();
            });
        });
    });
});
