import { Meteor } from 'meteor/meteor';
import { HTTP } from 'meteor/http';
import { moment } from 'meteor/mrt:moment';
import Buoy from 'buoyjs';
import humps from 'humps';

const Future = Npm.require('fibers/future');

export default class StationWebService {
    constructor() {}

    _getTimeStamp() {
        return Math.round(new Date().getTime()/1000);
    }

    _convertCtoF(value) {
        let fahr = value * 9 / 5 + 32;
        return fahr;
    }

    fetchStations() {
        console.log('[+] Compiling a collection of stations');
        try {
            const HUMPS = require('humps');

            // go and get the stations, and convert the heathen snake case to
            // glorious camel case.
            let response = Assets.getText('stations/cbibs.json'),
                snakeData = JSON.parse(response),
                data = HUMPS.camelizeKeys(snakeData);

            console.log(data);

            // time stuff
            let currentUnix = this._getTimeStamp();


            data.forEach((station) => {
                Object.assign(station, {createdAt: currentUnix});
                Object.assign(station, {stationId: station.ndbc.split(':').reverse()[0]});
                Object.assign(station, {isPrimary: false});
                Stations.upsert({id: station.id}, station);
            });
            console.log('[+] Station compilations complete.');
            return;
        } catch (exception) {
            if (exception.response) {
                // We've caught an exception in the HTTP response, and can handle it.
                let error = {
                    code: exception.response.statusCode,
                    url: process.env.DATA_FOUNTAIN_URL,
                    data: exception.response.data
                };

                console.log(`\r\n\tThere was a problem connecting to OceansMap.\r\n\tOceansMap connection responded with:\n\r\t\t ${EJSON.stringify(error)}\n\r\tMake sure the URL is correct, and that data is flowing.\r\n\tIf the problem persists, you'll need to call for help. The previous stations will be used if possible.`);

            } else if (exception.errno) {
                // We've caught a connection refused error, and can handle it.
                console.log(`\r\n\tWell this is embarrasing . . . it appears that our servers cannot be reached for some reason.  Please try again later: ${exception}`);

            } else {
                // We have no idea what the problem is, and can't even.
                console.log(`${exception}, please make sure settings are configured.`);
            }
        }
    }

    fetchStationsData() {
        console.log(`[+] Compiling a collection of data from stations`);
        try {
            // define our method constants
            const Humps = Npm.require('humps');
            const DATE = new Date();
            const DURATION = Meteor.settings.defaultDuration;
            const KNOTS_TO_MPH = 1.152;
            const METER_TO_FT = 3.28084;
            const MPS_TO_MPH = 2.2369363;

            // set the end date to today.
            let endDate = DATE.toISOString();

            // calculate a new date from the duration
            let startDate = new Date();
            startDate.setHours(startDate.getHours() - DURATION);
            startDate = startDate.toISOString();

            let stations = Stations.find({}, {fields: {dataUrl: 1, id: 1, title: 1, stationId: 1, usgs: 1}}).fetch();

            // create a place to store the results
            let dataSet = [];

            for (let station of stations) {
                let data = {};
                let headers;

                let compiledUrl = `${Meteor.settings.dataFountainUrl}${station.dataUrl}?time=${startDate}/${endDate}`;
                data.data = {};
                data.id = station.id;
                data.title = station.title;
                data.stationId = station.stationId;
                data.usgsSite = station.usgs.split(':')[1];

                /***************
                 *  OceansMap
                 ***************/
                // // make the call to get the scientific data, and block with future.
                // HTTP.call('GET', compiledUrl, (error, response) => {
                //     if (error || response.error) {
                //         console.log(`[!] Error from OceansMap: ${error}`);
                //     } else {
                //         try {
                //         let responseData = Humps.camelizeKeys(response.data);
                //         let gageHeight = responseData.data.gageHeight;
                //         let oceansMapData =  Humps.camelizeKeys(response.data);
                //
                //         let times = moment(responseData.data.times).seconds(0).milliseconds(0).toISOString()
                //
                //         let airPressure = {
                //             values: responseData.data.airPressure.values,
                //             units: responseData.data.airPressure.units[0],
                //             times
                //         };
                //
                //         let dewPointTemperature = {
                //             values: this._convertCtoF(responseData.data.dewPointTemperature.values),
                //             units: "F",
                //             times
                //
                //         };
                //
                //         let relativeHumidity = {
                //             values: responseData.data.relativeHumidity.values,
                //             units: responseData.data.relativeHumidity.units[0],
                //             times
                //         };
                //
                //         let seanettleProb = {
                //             values: responseData.data.seanettleProb.values,
                //             units:  responseData.data.seanettleProb.units[0],
                //             times
                //         };
                //
                //         data.data.airPressure = airPressure;
                //         data.data.dewPointTemperature = dewPointTemperature;
                //         data.data.relativeHumidity = relativeHumidity;
                //         data.data.seaNettleProbability = seanettleProb;
                //
                //         Data.upsert({id: data.id}, data);
                //         } catch (e) {
                //             console.log(e);
                //         }
                //     }
                // });

                /***************
                 *  BuoyJS
                 ***************/
                let ndbcRootUrl = `http://www.ndbc.noaa.gov/data/realtime2/`;
                HTTP.get(`${ndbcRootUrl}${data.stationId}.ocean`, (error, response) => {
                    if (error || response.error) {
                        console.log(`[!] Error from BuoyJS ocean: ${error}`);
                    } else {
                        let currentBuoyData = Buoy.Buoy.realTime(response.content),
                            times = [],
                            oceanTempValues = [],
                            clconValues = [],
                            o2ppmValues = [],
                            turbidityValues = [],
                            salinityValues = [];

                        currentBuoyData.forEach((datum) => {
                            let time = moment(datum.date).seconds(0).milliseconds(0).toISOString();
                            times.push(time);
                            oceanTempValues.push(this._convertCtoF(datum.oceanTemp));
                            clconValues.push(datum.chlorophyllConcentration);
                            o2ppmValues.push(datum.oxygenPartsPerMil);
                            turbidityValues.push(datum.turbidity);
                            salinityValues.push(datum.waterSalinity);
                        });

                        // Make sure all the data is in the correct order.
                        times.sort((a,b) => {
                            return new Date(a) - new Date(b);
                        });
                        oceanTempValues.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });
                        clconValues.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });
                        o2ppmValues.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });
                        turbidityValues.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });
                        salinityValues.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });


                        let oceanTemp = {
                            values: oceanTempValues,
                            units: 'F',
                            type: 'timeSeries',
                            times
                        };

                        let chlorophyllCon = {
                            values: clconValues,
                            units: '\u03BCg/L',
                            type: 'timeSeries',
                            times
                        };

                        let oxygenPartsPerMil = {
                            values: o2ppmValues,
                            units: 'ppm',
                            type: 'timeSeries',
                            times
                        };

                        let turbidity = {
                            values: turbidityValues,
                            units: 'FTU',
                            type: 'timeSeries',
                            times
                        };

                        let waterSalinity = {
                            values: salinityValues,
                            units: 'PSU',
                            type: 'timeSeries',
                            times
                        };



                        data.data.oceanTemperature = oceanTemp;
                        data.data.chlorophyll = chlorophyllCon;
                        data.data.dissolvedOxygen = oxygenPartsPerMil;
                        data.data.turbidity = turbidity;
                        data.data.salinity = waterSalinity;
                        if (!data.data.times) {
                            data.data.times = times;
                        }
                        Data.upsert({id: data.id}, data);
                    }
                });

                /***************
                 *  BuoyJS
                 ***************/
                HTTP.get(`${ndbcRootUrl}${data.stationId}.txt`, (error, response) => {
                    if (error || response.error) {
                        console.log(`[!] Error from BuoyJS met: ${error}`);
                    } else {
                        let currentBuoyData = Buoy.Buoy.realTime(response.content),
                            times = [];
                            wdir = [],
                            wspd = [],
                            atmp = [],
                            waveHeightValues = [],
                            wtmp = [];

                        currentBuoyData.forEach((datum) => {
                            if (moment(datum.date).minute() === 0) {
                                let time = moment(datum.date).seconds(0).milliseconds(0).toISOString();
                                times.push(time);
                                wdir.push(datum.windDirection);
                                wspd.push(datum.windSpeed * MPS_TO_MPH);
                                atmp.push(this._convertCtoF(datum.airTemp));
                                waveHeightValues.push(datum.waveHeight);
                                wtmp.push(this._convertCtoF(datum.waterTemp));
                            } else if (moment(datum.date).minute() === 50 ) {
                                let time = moment(datum.date).minutes(0).seconds(0).milliseconds(0).toISOString();
                                times.push(time);
                                wdir.push(datum.windDirection);
                                wspd.push(datum.windSpeed * MPS_TO_MPH);
                                atmp.push(this._convertCtoF(datum.airTemp));
                                waveHeightValues.push(datum.waveHeight);
                                wtmp.push(this._convertCtoF(datum.waterTemp));

                            }
                        });

                        // Make sure all the data is in the correct order.
                        times.sort((a,b) => {
                            return new Date(a) - new Date(b);
                        });
                        wdir.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });
                        wspd.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });
                        atmp.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });
                        waveHeightValues.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });
                        wtmp.sort((a,b) => {
                            return new Date(a[0]) - new Date(b[0]);
                        });


                        let windDirection = {
                            values: wdir,
                            units: 'deg',
                            type: 'timeSeries',
                            times
                        };

                        let windSpeed = {
                            values: wspd,
                            units: 'mph',
                            type: 'timeSeries',
                            times
                        };

                        let airTemp = {
                            values: atmp,
                            units: 'F',
                            type: 'timeSeries',
                            times
                        };

                        let waterTemp = {
                            values: wtmp,
                            units: 'F',
                            type: 'timeSeries',
                            times
                        };

                        let waveHeight = {
                            values: waveHeightValues,
                            units: 'm',
                            type: 'timeSeries',
                            times
                        };
                        data.data.windDirection = windDirection;
                        data.data.windSpeed = windSpeed;
                        data.data.airTemperature = airTemp;
                        data.data.waveHeight = waveHeight;
                        data.data.waterTemperature = waterTemp;
                        if (!data.data.times) {
                            data.data.times = times;
                        }
                        Data.upsert({id: data.id}, data);
                    }
                });

                /*************
                 * USGS
                 * **********/
                let usgsPortalUrl = 'http://usgs-portal.herokuapp.com/';

                HTTP.get(`${usgsPortalUrl}${data.usgsSite}?startDT=${startDate}&endDT=${endDate}`, (error, response) => {
                    if (error || response.error) {
                        console.log(`[!] Error from USGS: ${error}`);
                    } else {
                        try {
                            let usgsBuoyData = JSON.parse(response.content),
                                gageHeight = [],
                                times = [];

                            usgsBuoyData.data.forEach((datum) => {
                                if (moment(datum.utc).minute() === 0) {
                                    if (datum['69564_00065']) {
                                        gageHeight.push(parseFloat(datum['69564_00065']));
                                        times.push(datum['utc']);
                                    }
                                }
                            });

                            times.sort((a,b) => {
                                return new Date(a) - new Date(b);
                            });

                            let waterLevel = {
                                type: 'timeSeries',
                                units: 'ft',
                                values: gageHeight,
                                times
                            }

                            if (gageHeight.length > 0) {
                                data.data.waterLevel = waterLevel;
                                Data.upsert({id: data.id}, data);
                            }
                        } catch(exception) {
                            console.log(exception);
                        }
                    }
                });

            }
            console.log(`[+] Station Data compilations complete.`);
            return;
            // when the future is ready, return the data.
        } catch(exception) {
            //debugger;
            console.log(exception);
            return exception;
        }
    }

    fetchWeatherForecast() {
        try {
            /***************
             *  Forecast.io
             ***************/
            // These are server settings, and should be configured via the user profile.
            const FORECAST_API = process.env.FORECAST_API || Meteor.settings.forecastIoApi;
            const DURATION = Meteor.settings.defaultDuration;
            const COORD = [process.env.FORECAST_COORD_LAT, process.env.FORECAST_COORD_LON] || [Meteor.settings.forecastIoCoord[0], Meteor.settings.forecastIoCoord[1]];
            let referenceStation = Stations.findOne({isPrimary: true}, {fields: {'title': 1, 'lon': 1, 'lat': 1, 'stationId': 1}});
            if (referenceStation) {
                let referenceStationData = Data.findOne({stationId: referenceStation.stationId}, {fields: {'data.times': 1}});
                let timeSet = referenceStationData.data.times;
                let weather = Weather.find({}).fetch();

                let removeCount = Weather.remove({});
                let TEMPTimeSet = timeSet.splice(timeSet.length - 55, timeSet.length - 1);
                for (let i=0; i < TEMPTimeSet.length -1; i++) {
                    let unixTime = moment(TEMPTimeSet[i]).unix();
                    let url = `https://api.forecast.io/forecast/${FORECAST_API}/${referenceStation.lat},${referenceStation.lon},${unixTime}`;
                    HTTP.get(url, (error, response) => {
                        if (error) {
                            console.log(`fetchWeatherForecast ${error}`);
                        } else {
                            Weather.insert(response.data);
                        }
                    });
                }
            }
        } catch (exception) {
            console.log('There was an error, trying again in 10 seconds');
            console.log(exception);
            Meteor.setTimeout(() => {
                this.fetchWeatherForecast();
            }, 10000);
        }
    }
}
