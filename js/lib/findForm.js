var formManager = function(){
    /**
     Code based on:
     @url https://dxr.mozilla.org/firefox/source/toolkit/components/passwordmgr/src/nsLoginManager.js#655
     */
    var settings = {};

    return {
        _init_: function () {
            API.runtime.sendMessage(API.runtime.id, {method: 'getSetting', args: 'debug'}).then(function (result) {
                settings.debug = (result);
            });
        },
        /**
         *
         * _isAutoCompleteDisabled
         *
         * Returns true if the page requests autocomplete be disabled for the
         * specified form input.
         */
        isAutocompleteDisabled: function (element) {
            return !!(element && element.hasAttribute("autocomplete") && element.getAttribute("autocomplete").toLowerCase() === "off");
        },
        /**
         * Check if if an element is visible
         * @param element
         * @returns {boolean}
         */
        isElementVisible: function (element) {
            return !!( element.offsetWidth || element.offsetHeight || element.getClientRects().length );
        },
        /**
         * _getPasswordFields
         *
         * Returns an array of password field elements for the specified form.
         * If no pw fields are found, or if more than 3 are found, then null
         * is returned.
         *
         * skipEmptyFields can be set to ignore password fields with no value.
         */
        _getPasswordFields: function (form, skipEmptyFields) {
            // Locate the password fields in the form.
            var pwFields = [];
            for (var i = 0; i < form.elements.length; i++) {
                var elem = form.elements[i];
                if (elem.type !== "password"){
                    continue;
                }

                if(!this.isElementVisible(elem)){
                    continue;
                }

                if (skipEmptyFields && !elem.value){
                    continue;
                }

                pwFields[pwFields.length] = {
                    index: i,
                    element: elem
                };
            }

            // If too few or too many fields, bail out.
            if (pwFields.length === 0) {
                this.log('(form ignored ('+ form.action +') -- no password fields.)');
                return null;
            } else if (pwFields.length > 3) {
                this.log('(form ignored -- too many password fields. [got ' +
                    pwFields.length + "])");
                return null;
            }

            return pwFields;
        },
        /*
         * _getFormFields
         *
         * Returns the username and password fields found in the form.
         * Can handle complex forms by trying to figure out what the
         * relevant fields are.
         *
         * Returns: [usernameField, newPasswordField, oldPasswordField]
         *
         * usernameField may be null.
         * newPasswordField will always be non-null.
         * oldPasswordField may be null. If null, newPasswordField is just
         * "theLoginField". If not null, the form is apparently a
         * change-password field, with oldPasswordField containing the password
         * that is being changed.
         */
        getFormFields: function (form, isSubmission) {
            var usernameField = null;

            // Locate the password field(s) in the form. Up to 3 supported.
            // If there's no password field, there's nothing for us to do.
            var pwFields = this._getPasswordFields(form, isSubmission);
            if (!pwFields){
                return [null, null, null];
            }



            // Locate the username field in the form by searching backwards
            // from the first passwordfield, assume the first text field is the
            // username. We might not find a username field if the user is
            // already logged in to the site.
            for (var i = pwFields[0].index - 1; i >= 0; i--) {
                if(!this.isElementVisible(form.elements[i])){
                    continue;
                }
                if (form.elements[i].type.toLowerCase() === "text" || form.elements[i].type.toLowerCase() === "email") {
                    usernameField = form.elements[i];
                    break;
                }
            }

            if (!usernameField){
                this.log('(form ('+ form.action +') ignored -- no username field found)');
            }


            // If we're not submitting a form (it's a page load), there are no
            // password field values for us to use for identifying fields. So,
            // just assume the first password field is the one to be filled in.
            if (!isSubmission || pwFields.length === 1){
                var res = [usernameField, pwFields[0].element];
                if(pwFields[1]){
                    res.push(pwFields[1].element);
                } else {
                    res.push(null);
                }
                return res;
            }



            // Try to figure out WTF is in the form based on the password values.
            var oldPasswordField, newPasswordField;
            var pw1 = pwFields[0].element.value;
            var pw2 = pwFields[1].element.value;
            var pw3 = (pwFields[2] ? pwFields[2].element.value : null);

            if (pwFields.length === 3) {
                // Look for two identical passwords, that's the new password

                if (pw1 === pw2 && pw2 === pw3) {
                    // All 3 passwords the same? Weird! Treat as if 1 pw field.
                    newPasswordField = pwFields[0].element;
                    oldPasswordField = null;
                } else if (pw1 === pw2) {
                    newPasswordField = pwFields[0].element;
                    oldPasswordField = pwFields[2].element;
                } else if (pw2 === pw3) {
                    oldPasswordField = pwFields[0].element;
                    newPasswordField = pwFields[2].element;
                } else if (pw1 === pw3) {
                    // A bit odd, but could make sense with the right page layout.
                    newPasswordField = pwFields[0].element;
                    oldPasswordField = pwFields[1].element;
                } else {
                    // We can't tell which of the 3 passwords should be saved.
                    this.log("(form ignored -- all 3 pw fields differ)");
                    return [null, null, null];
                }
            } else { // pwFields.length == 2
                if (pw1 === pw2) {
                    // Treat as if 1 pw field
                    newPasswordField = pwFields[0].element;
                    oldPasswordField = null;
                } else {
                    // Just assume that the 2nd password is the new password
                    oldPasswordField = pwFields[0].element;
                    newPasswordField = pwFields[1].element;
                }
            }

            return [usernameField, newPasswordField, oldPasswordField];
        },
        log: function (str) {
            if(settings.debug){
                console.log(str);
            }
        }
    };
}();

function getLoginFields(isSubmission) {
    var forms = document.forms;
    var loginForms = [];

    for (var i = 0; i < forms.length; i++) {
        var form = forms[i];
        var result = formManager.getFormFields(form, isSubmission);
        var usernameField = result[0];
        var passwordField = result[1];
        // Need a valid password field to do anything.
        if (passwordField === null){
            continue;
        }

        var res = [usernameField, passwordField];
        if(result[2]){
            res.push(result[2]);
        } else {
            res.push(null);
        }
        loginForms.push(res);
    }
    return loginForms;
}

function getFormFromElement(elem) {
    if(elem) {
        while (elem.parentNode) {
            if (elem.parentNode.nodeName.toLowerCase() === "form") {
                return elem.parentNode;
            }
            elem = elem.parentNode;
        }
    }
}

function dispatchEvents(element){
    var eventNames = [ 'click', 'focus', 'keypress', 'keydown', 'keyup', 'input', 'blur', 'change' ];
    eventNames.forEach(function(eventName) {
        element.dispatchEvent(new Event(eventName, {"bubbles":true}));
    });
}

function fillPassword(user, password) {
    var loginFields = getLoginFields();
    for (var i = 0; i < loginFields.length; i++) {
        if(user && loginFields[i][0]){
            loginFields[i][0].value = user;
            if(loginFields[i][0].offsetParent) {
                dispatchEvents(loginFields[i][0]);
            }
        }
        if(password && loginFields[i][1]) {
            loginFields[i][1].value = password;
            if(loginFields[i][1].offsetParent) {
                dispatchEvents(loginFields[i][1]);
            }
        }
        if(password && loginFields[i][2]) {
            loginFields[i][2].value = password;
            if(loginFields[i][2].offsetParent) {
                dispatchEvents(loginFields[i][2]);
            }
        }
    }

}
formManager._init_();