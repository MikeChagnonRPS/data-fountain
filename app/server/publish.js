Meteor.publish('Stations', () => {
    return Stations.find({});
});

Meteor.publish('Data', () => {
    return Data.find({});
});

Meteor.publish('Weather', () => {
    return Weather.find({});
});
