const axios = require('axios');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();

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



	constructor(log, debug) {

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
		this.log("Starting Sengled Client...");
		this.lastLogin = moment('2000-01-01')
		this.uuid = _guid();
		
		this.cache = new Array();
		this.lastCache = moment('2000-01-01')
	}

	/**
	 * JSESSION is valid for at least 24h
	 */
	login(username, password) {
		let me = this;
		if (me.debug) me.log("login invoked " + username);
		
		return new Promise((fulfill, reject) => {
			if (this.jsessionid != null) {
				fulfill(this.loginResponse);
			}
			this.client.post('/customer/login.json', {
				"os_type": "android",
				"pwd": password,
				"user": username,
				"uuid": "xxxxxx"
			}).then((response) => {
				this.jsessionid = response.data.jsessionid;
				this.lastLogin = moment();
				this.loginResponse = response;
				fulfill(response);
			}).catch(function(error) {
				this.log(error);
				reject(error);
			});

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
	getDevices() {
		let me = this;
		if (me.debug) me.log("getDevices invoked ");
		if (me.debug) me.log(me.cache);
		if (me.debug) me.log(moment() - me.lastCache);
		if (moment() - me.lastCache <= 2000){
			if (me.debug) me.log("######getDevices from cache ");
			me.cache.map((device) => {return newDevice;});
		}
		
		return new Promise((fulfill, reject) => {
			this.client.post('/room/getUserRoomsDetail.json', {})
				.then((response) => {
					if (response.data.ret == 100) {
						reject(response.data);
					} else {
						let roomList = response.data.roomList
						let deviceList = _ArrayFlatMap(roomList, i => i.deviceList);
						let devices = deviceList.map((device) => {
							var newDevice = {
								id: device.deviceUuid,
								name: device.deviceName,
								status: device.onoff,
								brightness: device.brightness,
								colortemperature: device.colortemperature,
								isOnline: device.isOnline,
								signalQuality: device.signalQuality,
								productCode: device.productCode
							};
							me.cache[newDevice.id] = newDevice;
							me.lastCache = moment();
							return newDevice;
						});
						fulfill(devices);
					}
				}).catch(function(error) {
					reject(error);
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
				}).catch(function(error) {
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
				.catch(function(error) {
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
				.catch(function(error) {
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
				.catch(function(error) {
					reject(error);
				});
		});
	}
};
