const axios = require('axios');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();
const _semaphore = require('semaphore')(1);



let moment = require('moment');
const https = require('https');

function _ArrayFlatMap(array, selector) {
	if (array.length == 0) {
		return [];
	} else if (array.length == 1) {
		return selector(array[0]);
	}
	return array.reduce((prev, next) =>
		( /*first*/ selector(prev) || /*all after first*/ prev).concat(selector(next)))
}

function _guid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.substring(1);
	}
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
		s4() + '-' + s4() + s4() + s4();
}

module.exports = class ElementHomeClient {


	/**
	 * Ctor
	 * @param {log} log Loggin Object
	 * @param {boolean} debug Debug semaphore
	 * @param {int} cacheDuration Duration of cache in milliseconds
	 */
	constructor(log, debug = false, info = true, cacheDuration = 2000, ) {

		this.client = axios.create({
			baseURL: 'https://element.cloud.sengled.com/zigbee/',
			timeout: 2000,
			jar: cookieJar,
			withCredentials: true,
			responseType: 'json',
		});
		this.client.defaults.headers.post['Content-Type'] = 'application/json';
		this.log = log
		this.debug = debug
		this.info = info
		if (this.info) this.log("Starting Sengled Client...");
		this.lastLogin = moment('2000-01-01')
		this.uuid = _guid();

		this.cache = {};
		this.lastCache = moment('2000-01-01')
		this.cacheDuration = cacheDuration;
		if (this.debug) this.log("set cache duration " + this.cacheDuration);
	}

	/**
	 * JSESSION is valid for at least 24h
	 */
	login(username, password) {
		let me = this;
		if (me.debug) me.log("login invoked " + username);
		if (me.debug) me.log("login sessionid " + this.jsessionid);

		return new Promise((fulfill, reject) => {
			if (this.jsessionid != null) {
				if (me.debug) me.log("login via cookie");
				fulfill(this.loginResponse);
			} else {
				if (me.debug || me.info) me.log("login via api");
				this.client.post('/customer/login.json', {
					"os_type": "android",
					"pwd": password,
					"user": username,
					"uuid": "xxxxxx"
				}).then((response) => {
					me.jsessionid = response.data.jsessionid;
					me.lastLogin = moment();
					me.loginResponse = response;
					if (me.debug) me.log("logged in to Sengled");
					fulfill(response);
				}).catch(function (error) {
					this.log(error);
					reject(error);
				});
			}
		});
	}

	/**
	  * Uses get getUserRoomsDetail for also accessing brightness and color temperature level
      * Example device response of mapped object:
      * homebridge_1  |   {
      * homebridge_1  |     deviceUuid: 'B0CE1814030410A7',
      * homebridge_1  |     gatewayUuid: 'B0:CE:18:18:20:9D',
      * homebridge_1  |     deviceName: 'Lampe1',
      * homebridge_1  |     brightness: 254,
      * homebridge_1  |     colortemperature: 58,
      * homebridge_1  |     onoff: 0,
      * homebridge_1  |     signalQuality: 5,
      * homebridge_1  |     signalValue: 255,
      * homebridge_1  |     activeHours: 19668,
      * homebridge_1  |     isOnline: 1,
      * homebridge_1  |     power: '0',
      * homebridge_1  |     onCount: 251,
      * homebridge_1  |     powerConsumptionTime: '4477667',
      * homebridge_1  |     productCode: 'Z-DevProductCode-Def',
      * homebridge_1  |     attributeIds: '0,1,2,3,4',
      * homebridge_1  |     rgbColorR: 144,
      * homebridge_1  |     rgbColorG: 255,
      * homebridge_1  |     rgbColorB: 255
      * homebridge_1  |   },
      * homebridge_1  |   {
      * homebridge_1  |     deviceUuid: 'B0CE1814030426E9',
      * homebridge_1  |     gatewayUuid: 'B0:CE:18:18:20:9D',
      * homebridge_1  |     deviceName: 'Lampe2',
      * homebridge_1  |     brightness: 40,
      * homebridge_1  |     colortemperature: 100,
      * homebridge_1  |     onoff: 0,
      * homebridge_1  |     signalQuality: 5,
      * homebridge_1  |     signalValue: 0,
      * homebridge_1  |     activeHours: 19668,
      * homebridge_1  |     isOnline: 1,
      * homebridge_1  |     power: '0',
      * homebridge_1  |     onCount: 1092,
      * homebridge_1  |     powerConsumptionTime: '10799057',
      * homebridge_1  |     productCode: 'Z-DevProductCode-Def',
      * homebridge_1  |     attributeIds: '0,1,2,3,4',
      * homebridge_1  |     rgbColorR: 144,
      * homebridge_1  |     rgbColorG: 255,
      * homebridge_1  |     rgbColorB: 255
      * homebridge_1  |   }
	*/
	getDevices(cached = false) {
		let me = this;
		if (me.debug) me.log("getDevices invoked " + cached);
		if (me.debug) me.log("cache size: " + Object.keys(me.cache).length);
		if (me.debug) me.log("cache age: " + (moment() - me.lastCache));

		return new Promise((fulfill, reject) => {
			_semaphore.take(() => {
				if (moment() - me.lastCache <= me.cacheDuration || (cached && Object.keys(me.cache).length > 0)) {
					if (me.debug) me.log("getDevices via cache ");
					let devices = Object.keys(me.cache).map((deviceID) => {
						let cachedDevice = me.cache[deviceID];
						if (me.debug) me.log("cache device: " + JSON.stringify(cachedDevice));
						return cachedDevice;
					});
					_semaphore.leave();
					fulfill(devices);
				} else {
					if (me.debug || me.info) me.log("getDevices via api ");
					this.client.post('/room/getUserRoomsDetail.json', {})
						.then((response) => {
							if (response.data.ret == 100) {
								reject(response.data);
							} else {
								let roomList = response.data.roomList
								let deviceList = _ArrayFlatMap(roomList, i => i.deviceList);
								let devices = deviceList.map((device) => {
									var apiDevice = {
										id: device.deviceUuid,
										name: device.deviceName,
										status: device.onoff,
										brightness: device.brightness,
										colortemperature: device.colortemperature,
										isOnline: device.isOnline,
										signalQuality: device.signalQuality,
										productCode: device.productCode
									};
									if (me.debug) me.log("api device: " + JSON.stringify(apiDevice));
									me.cache[apiDevice.id] = apiDevice;
									me.lastCache = moment();
									return apiDevice;
								});
								_semaphore.leave();
								fulfill(devices);
							}
						}).catch(function (error) {
							_semaphore.leave();
							reject(error);

						});
				}
			});


		});
	}

	userInfo() {
		let me = this;
		if (me.debug) me.log("userInfo invoked ");
		return new Promise((fulfill, reject) => {
			this.client.post('/customer/getUserInfo.json', {})
				.then((response) => {
					if (response.data.ret == 100) {
						reject(response.data);
					} else {
						fulfill(response);
					}
				}).catch(function (error) {
					reject(error);
				});
		});
	}

	deviceSetOnOff(deviceId, onoff) {
		let me = this;
		if (me.debug) me.log("deviceSetOnOff invoked " + deviceId + " switching to " + onoff);
		return new Promise((fulfill, reject) => {
			this.client
				.post('/device/deviceSetOnOff.json', {
					onoff: onoff ? 1 : 0,
					deviceUuid: deviceId
				})
				.then(response => {
					if (response.data.ret == 100) {
						reject(response.data);
					} else {
						fulfill(response);
					}
				})
				.catch(function (error) {
					reject(error);
				});
		});
	}

	// brightness: 0 - 255
	deviceSetBrightness(deviceId, brightness) {
		let me = this;
		if (me.debug) me.log("deviceSetBrightness invoked " + deviceId + " with brightness to " + brightness);
		return new Promise((fulfill, reject) => {
			this.client
				.post('/device/deviceSetBrightness.json', {
					brightness: brightness,
					deviceUuid: deviceId
				})
				.then(response => {
					if (response.data.ret == 100) {
						reject(response.data);
					} else {
						fulfill(response);
					}
				})
				.catch(function (error) {
					reject(error);
				});
		});
	}

	// colorTemperature: 0 - 255
	deviceSetColorTemperature(deviceId, colorTemperature) {
		let me = this;
		if (me.debug) me.log("deviceSetColorTemperature invoked " + deviceId + " with color temperature to " + colorTemperature);
		return new Promise((fulfill, reject) => {
			this.client
				.post('/device/deviceSetColorTemperature.json', {
					colorTemperature: colorTemperature,
					deviceUuid: deviceId
				})
				.then(response => {
					if (response.data.ret == 100) {
						reject(response.data);
					} else {
						fulfill(response);
					}
				})
				.catch(function (error) {
					reject(error);
				});
		});
	}
};
