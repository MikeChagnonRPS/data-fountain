import { UserPreferences } from '/imports/startup/lib/collections/user-preferences.js';
import  StationWebService  from '/imports/api/StationWebService.js';
const stationWebService = new StationWebService();
/*****************************************************************************/
/*  Server Methods */
/*****************************************************************************/
Meteor.methods({
    'server/addUserPreference': function(doc) {
        let docId = UserPreferences.insert({profile: {}, owner: this.userId});
        console.log(docId, this.userId);
        return UserPreferences.update(docId, {$set: doc});
    },
    'server/removeUserPreference': function(docId) {
        if (typeof(docId) === 'string') {
            return UserPreferences.remove(docId);
        };
    },
    'server/getUserPreferences': function(){
        return UserPreferences.find({owner: this.userId}).fetch();
    },
    'server/fetchWeatherForecast': function(){
        stationWebService.fetchWeatherForecast();
    }
});
