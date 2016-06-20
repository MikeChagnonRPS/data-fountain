import swal from 'sweetalert';
/*****************************************************************************/
/* Register: Event Handlers */
/*****************************************************************************/
Template.Register.events({
    'submit form'(e) {
        e.preventDefault();

        let name = $('[name="name"]').val(),
            email = $('[name="email"]').val(),
            password = $('[name="password"]').val();

        Accounts.createUser({
            email: email,
            password: password,
            profile: {
                name: name
            },
        }, (err) => {
            if (err) {
                console.log(err);
            } else {
                Router.go('/');
            }
        });
    }
});

/*****************************************************************************/
/* Register: Helpers */
/*****************************************************************************/
Template.Register.helpers({
});

/*****************************************************************************/
/* Register: Lifecycle Hooks */
/*****************************************************************************/
Template.Register.onCreated(function () {
});

Template.Register.onRendered(function () {
});

Template.Register.onDestroyed(function () {
});
