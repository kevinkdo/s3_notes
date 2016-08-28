/*
 * @param array {Uint8Array}
 * @returns {string}
 */
function buf2str(array) {
    return new TextDecoder("utf-8").decode(array);
}

/*
 * @param str {string}
 * @returns {Uint8Array}
 */
function str2buf(str) {
    return new TextEncoder().encode(str);
}

/*
 * @param secret {string}
 * @param password {string}
 * @returns {Int16Array}
 */
function encryptSecret(secret, password) {
    var encrypted = new Int16Array(secret.length);
    for (var i = 0; i < secret.length; i++) {
        encrypted[i] = secret.charCodeAt(i) - password.charCodeAt(i % password.length);
    }
    return encrypted;
}

/*
 * @param array {Int16Array}
 * @param password {string}
 * @returns {string}
 */
function decryptSecret(array, password) {
    var decrypted = "";
    for (var i = 0; i < array.length; i++) {
        decrypted += String.fromCharCode(array[i] + password.charCodeAt(i % password.length));
    }
    return decrypted;
}


// Singleton
var S3Manager = {
  // Constants
  region: 'us-west-2',
  bucket: 'kevinkdo.com',
  notes_filename: 'notes.txt',
  ACL: 'private',
  access_key_id: 'AKIAI5NZKYTAV6VDJY3A',
  encrypted_secret: [19, -29, -31, -36, -22, -9, -16, -74, 55, 4, -57, -13, -38, -12, -32, -32, -2, -2, -25, -46, -48, 2, -44, -4, 11, 1, 70, -30, -21, 12, -13, -31, 6, 3, 5, 24, -9, -43, 3, -36],
  
  // State variables
  entered_password: '',
  s3: null,

  reloadConfigs: function() {
    AWS.config.credentials = new AWS.Credentials(this.access_key_id, decryptSecret(this.encrypted_secret, this.entered_password));
    AWS.config.region = this.region;
    this.s3 = new AWS.S3();
  },

  getS3: function() {
    return this.s3;
  },

  setPasswordAndReloadConfigs: function(new_password) {
    this.entered_password = new_password;
    this.reloadConfigs();
  }
};

var Router = React.createClass({
  getInitialState: function() {
    return {
      route: "login"
    };
  },

  setRoute: function(route) {
    this.setState({
      route: route
    });
  },

  render: function() {
    switch(this.state.route) {
      case "notes_editor":
        return <NotesEditor setRoute={this.setRoute} />;
        break;
      case "login":
        return <Login setRoute={this.setRoute} />;
        break;
    }
  }
});

var Login = React.createClass({
  getInitialState: function() {
    return {
      password: ""
    };
  },

  setPassword: function(event) {
    this.setState({
      password: event.target.value
    });
  },

  submit: function(event) {
    event.preventDefault();
    S3Manager.setPasswordAndReloadConfigs(this.state.password);
    this.props.setRoute("notes_editor");
  },

  render: function() {
    return <form onSubmit={this.submit} >
      <input type="password" value={this.state.password} onChange={this.setPassword} />
      <input type="submit" />
    </form>
  }
})

var NotesEditor = React.createClass({
  getInitialState: function() {
    return {
      text: "",
      status: "",
      is_error: false
    }
  },

  componentDidMount: function() {
    var me = this;
    S3Manager.getS3().getObject({Bucket: S3Manager.bucket, Key: S3Manager.notes_filename}, function(err, data) {
      if (err) {
        me.setState({
          status: err.code + ": " + err.message,
          is_error: true
        });
      } else {
        me.setState({
          text: buf2str(data.Body.buffer),
          status: "Last loaded " + new Date().toLocaleString(),
          is_error: false
        });
      }
    });
  },

  setText: function(event) {
    this.setState({
      text: event.target.value
    });
  },

  saveText: function() {
    var me = this;
    var put_options = {
      Bucket: S3Manager.bucket,
      Key: S3Manager.notes_filename,
      ACL: S3Manager.ACL,
      Body: str2buf(this.state.text)
    };

    S3Manager.getS3().putObject(put_options, function(err, data) {
      if (err) {
        me.setState({
          status: err,
          is_error: true
        });
      } else {
        me.setState({
          status: "Last saved " + new Date().toLocaleString(),
          is_error: false
        });
      }
    });
  },

  render: function() {
    return (
      <div>
      <button onClick={this.saveText}>Save</button><span className={this.state.is_error ? "error" : "success"}>{this.state.status}</span>
      <br />
      <textarea rows="40" cols="160" onChange={this.setText} value={this.state.text}/>
      </div>
    );
  }
});

ReactDOM.render(<Router />, document.getElementById('react_main'));
