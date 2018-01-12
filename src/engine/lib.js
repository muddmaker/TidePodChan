var Key = {
	Left: 37, Up: 38, Right: 39, Down: 40, Space: 32, Zero: 48, One: 49,
	Two: 50, Three: 51, Four: 52, Five: 53, Six: 54, Seven: 55, Eight: 56,
	Nine: 57, A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71, H: 72,
	I: 73, J: 74, K: 75, L: 76, M: 77, N: 78, O: 79, P: 80, Q: 81, R: 82,
	S: 83, T: 84, U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90, LastCode: 222
};

class Game {
	constructor(canvas_id, bg_r, bg_g, bg_b) {
		this.canvas = document.getElementById(canvas_id);
		this.gl = this.canvas.getContext("webgl");
		this.gl.clearColor(bg_r, bg_g, bg_b, 1.0);
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);
		this.squareBuf = this.gl.createBuffer();
		this._prev_time = Date.now();
		this._lag_time = 0;
		this._dt = 1 / 60;
		this._should_run = false;
		this._is_key_down = [];
		this._is_key_down_prev = [];
		this._resource_map = {};
		this._outstanding_loads = 0;
		this._acomplete_callback = null;

		for (var i = 0; i < Key.LastCode; ++i) {
			this._is_key_down[i] = false;
			this._is_key_down_prev[i] = false;
		}

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareBuf);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
			 0.5,  0.5, 0.0,
			-0.5,  0.5, 0.0,
			 0.5, -0.5, 0.0,
			-0.5, -0.5, 0.0]), this.gl.STATIC_DRAW);
	}

	_rupdate() {
		if (!this._should_run) return;
		window.requestAnimationFrame(this._rupdate.bind(this));

		var current = Date.now();
		var elapsed = current - this._prev_time;
		this._prev_time = current;
		this._lag_time += elapsed;
		var original_lag_time = this._lag_time;
		var update_count = 0;

		while ((this._lag_time >= this._dt * 1000) && this._should_run) {
			this.update(this._dt);

			for (var i = 0; i < Key.LastCode; ++i)
				this._is_key_down_prev[i] = this._is_key_down[i];

			this._lag_time -= this._dt * 1000;
			++update_count;
		}

		this.draw(update_count, original_lag_time);
	}

	_rkeydown(e) {
		this._is_key_down[e.keyCode] = true;
	}

	_rkeyup(e) {
		this._is_key_down[e.keyCode] = false;
	}

	_acomplete(n, a) {
		this._resource_map[n] = a;
		--this._outstanding_loads;

		if (this._outstanding_loads === 0 && this._acomplete_callback !== null) {
			this._acomplete_callback();
			this._acomplete_callback = null;
		}

		return a;
	}

	start() {
		this._should_run = true;
		window.requestAnimationFrame(this._rupdate.bind(this));
		window.addEventListener('keyup', this._rkeyup.bind(this));
		window.addEventListener('keydown', this._rkeydown.bind(this));
	}

	quit() {
		this._should_run = false;
	}

	isKeyDown(k) {
		return this._is_key_down[k];
	}

	isKeyPressed(k) {
		return this._is_key_down[k] && (!this._is_key_down_prev[k]);
	}

	isKeyReleased(k) {
		return (!this._is_key_down[k]) && this._is_key_down_prev[k];
	}

	hasResource(a) {
		return a in this._resource_map;
	}

	getResourse(a) {
		return this.hasResource(a) ? this._resource_map[a] : null;
	}

	rmResource(n) {
		if (n in this._resource_map)
			delete this._resource_map[n];
	}

	set asyncLoadCallback(f) {
		if (this._outstanding_loads === 0)
			f();
		else
			this._acomplete_callback = f;
	}

	_fetch_resource(n, rh, lf, cf) {
		if (this.hasResource(n)) {
			if (cf !== null && cf != undefined)
				cf(n);
		} else {
			++this._outstanding_loads;
			var req = XMLHttpRequest();
			req.open('GET', n, true);
			req.setRequestHeader('Content-Type', rh);

			req.onload = () => {
				this._acallback(n, lf(req));

				if (cf !== null && cf !== undefined)
					cf(n);
			};

			req.send();
		}
	}

	fetchXmlResource(n, cf) {
		this._fetch_resource(n, "text/xml", req => {
			var parser = new DOMParser();
			return parser.parseFromString(req.responceText, "text/xml");
		}, cf);
	}

	fetchTextResource(n, cf) {
		this._fetch_resource(n, "text/xml", req => req.responceText, cf);
	}
}

class Camera {
	constructor(game, center, width, viewport) {
		this.gl = game.gl;
		this.center = center;
		this.width = width;
		this.viewport = viewport;
		this.near = 0;
		this.far = 1000;
		this.bg = [0.8, 0.8, 0.8, 1.0];

		this._view = mat4.create();
		this._proj = mat4.create();
		this._vp = mat4.create();
	}

	get vp() { return this._vp; }

	setup_vp() {
		this.gl.viewport(this.viewport[0], this.viewport[1],
			this.viewport[2], this.viewport[3]);
		this.gl.scissor(this.viewport[0], this.viewport[1],
			this.viewport[2], this.viewport[3]);
		this.gl.clearColor(this.bg[0], this.bg[1], this.bg[2],
			this.bg[3]);
		this.gl.enable(this.gl.SCISSOR_TEST);
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);
		this.gl.disable(this.gl.SCISSOR_TEST);

		mat4.lookAt(this._view, [this.center[0], this.center[1], 10],
			[this.center[0], this.center[1], 0], [0, 1, 0]);

		var half_w = this.width * 0.5;
		var half_h = half_w * this.viewport[3] / this.viewport[2];
		mat4.ortho(this._proj, -half_w, half_w, -half_h, half_h,
			this.near, this.far);

		mat4.multiply(this._vp, this._proj, this._view);
	}
}

class Transform {
	constructor() {
		this.pos = vec2.fromValues(0, 0);
		this.scale = vec2.fromValues(1, 1);
		this.rot = 0;
	}

	get x() { return this.pos[0]; }
	set x(_x) { this.pos[0] = _x; }
	get y() { return this.pos[1]; }
	set y(_y) { this.pos[1] = _y; }
	get width() { return this.scale[0]; }
	set width(_w) { this.scale[0] = _w; }
	get height() { return this.scale[1]; }
	set height(_h) { this.scale[1] = _h; }
	get rot_rad() { return this.rot; }
	get rot_deg() { return this.rot * 180.0 / Math.PI; }
	set rot_deg(_d) { this.rot_rad = _d * Math.PI / 180.0; }

	set rot_rad(_r) {
		this.rot = _r - 2.0 * Math.PI
			* Math.floor(_r / (2.0 * Math.PI));
	}

	get x_form() {
		var m = mat4.create();
		mat4.translate(m, m, vec3.fromValues(this.x, this.y, 0.0));
		mat4.rotateZ(m, m, this.rot_rad);
		mat4.scale(m,m, vec3.fromValues(this.width,this.height,1.0));
		return m;
	}
}

class Renderable {
	constructor(game, shader) {
		this.gl = game.gl;
		this.shader = shader;
		this.color = [1.0, 1.0, 1.0, 1.0];
		this.xform = new Transform();
		this.creation_time = Date.now();
	}

	draw(vp) {
		this.shader.activateShader(this.color, vp);
		this.shader.loadObjectTransform(this.xform.x_form);
		this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
	}
}