import * as fs from 'fs';
import * as WebSocket from 'ws';
import fetch from 'node-fetch';
const FormData = require('form-data');
import * as childProcess from 'child_process';
import * as http from 'http';
import loadConfig from '../src/config/load';
import { SIGKILL } from 'constants';

export const port = loadConfig().port;

export const async = (fn: Function) => (done: Function) => {
	fn().then(() => {
		done();
	}, (err: Error) => {
		done(err);
	});
};

export const request = async (endpoint: string, params: any, me?: any): Promise<{ body: any, status: number }> => {
	const auth = me ? {
		i: me.token
	} : {};

	const res = await fetch(`http://localhost:${port}/api${endpoint}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(Object.assign(auth, params))
	});

	const status = res.status;
	const body = res.status !== 204 ? await res.json().catch() : null;

	return {
		body, status
	};
};

export const signup = async (params?: any): Promise<any> => {
	const q = Object.assign({
		username: 'test',
		password: 'test'
	}, params);

	const res = await request('/signup', q);

	return res.body;
};

export const post = async (user: any, params?: any): Promise<any> => {
	const q = Object.assign({
		text: 'test'
	}, params);

	const res = await request('/notes/create', q, user);

	return res.body ? res.body.createdNote : null;
};

export const react = async (user: any, note: any, reaction: string): Promise<any> => {
	await request('/notes/reactions/create', {
		noteId: note.id,
		reaction: reaction
	}, user);
};

export const uploadFile = (user: any, path?: string): Promise<any> => {
		const formData = new FormData();
		formData.append('i', user.token);
		formData.append('file', fs.createReadStream(path || __dirname + '/resources/Lenna.png'));

		return fetch(`http://localhost:${port}/api/drive/files/create`, {
			method: 'post',
			body: formData,
			timeout: 30 * 1000,
		}).then(res => {
			if (!res.ok) {
				throw `${res.status} ${res.statusText}`;
			} else {
				return res.json();
			}
		});
};

export function connectStream(user: any, channel: string, listener: (message: Record<string, any>) => any, params?: any): Promise<WebSocket> {
	return new Promise((res, rej) => {
		const ws = new WebSocket(`ws://localhost:${port}/streaming?i=${user.token}`);

		ws.on('open', () => {
			ws.on('message', data => {
				const msg = JSON.parse(data.toString());
				if (msg.type == 'channel' && msg.body.id == 'a') {
					listener(msg.body);
				} else if (msg.type == 'connected' && msg.body.id == 'a') {
					res(ws);
				}
			});

			ws.send(JSON.stringify({
				type: 'connect',
				body: {
					channel: channel,
					id: 'a',
					pong: true,
					params: params
				}
			}));
		});
	});
}

export const simpleGet = async (path: string, accept = '*/*'): Promise<{ status?: number, type?: string, location?: string }> => {
	// node-fetchだと3xxを取れない
	return await new Promise((resolve, reject) => {
		const req = http.request(`http://localhost:${port}${path}`, {
			headers: {
				Accept: accept
			}
		}, res => {
			if (res.statusCode! >= 400) {
				reject(res);
			} else {
				resolve({
					status: res.statusCode,
					type: res.headers['content-type'],
					location: res.headers.location,
				});
			}
		});

		req.end();
	});
};

export function launchServer(callbackSpawnedProcess: (p: childProcess.ChildProcess) => void, moreProcess: () => Promise<void> = async () => {}) {
	return (done: (err?: Error) => any) => {
		const p = childProcess.spawn('node', [__dirname + '/../index.js'], {
			stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
			env: { NODE_ENV: 'test', PATH: process.env.PATH }
		});
		callbackSpawnedProcess(p);
		p.on('message', message => {
			if (message === 'ok') moreProcess().then(() => done()).catch(e => done(e));
		});
	};
}

export function shutdownServer(p: childProcess.ChildProcess, timeout = 20 * 1000) {
	return new Promise((res, rej) => {
		const t = setTimeout(() => {
			p.kill(SIGKILL);
			res('force exit');
		}, timeout);

		p.once('exit', () => {
			clearTimeout(t);
			res('exited');
		});

		p.kill();
	});
}
