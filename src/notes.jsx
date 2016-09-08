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
const S3Manager = {
  // Constants
  region: 'us-west-2',
  bucket: 'kkdo.me',
  personal_notes_filename:'notes.txt',
  work_notes_filename: 'notes_work.txt',
  private_acl: 'private',
  public_acl: 'public-read',
  access_key_id: 'AKIAIUDZNB443E5GRHIA',
  encrypted_secret: [-30, -46, -52, -5, 25, -14, -34, -2, 4, -43, -62, 10, -48, -9, 11, -35, -20, 33, -41, 4, -20, -27, -50, -8, 10, -35, 25, -20, 1, -21, -30, 21, -27, -19, 5, 8, -27, -31, 0, -44],
  
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

const Router = React.createClass({
  getInitialState: function() {
    return {
      route: "login",
      initial_text: ""
    };
  },

  setRoute: function(route) {
    this.setState({
      route: route
    });
  },

  routeToEditInitialText: function(initial_text) {
    this.setState({
      route: "notes_editor",
      initial_text: initial_text
    });
  },

  render: function() {
    switch(this.state.route) {
      case "notes_editor":
        return <NotesEditor setRoute={this.setRoute} initial_text={this.state.initial_text} />;
        break;
      case "login":
        return <Login setRoute={this.setRoute} routeToEditInitialText={this.routeToEditInitialText}/>;
        break;
    }
  }
});

const Login = React.createClass({
  getInitialState: function() {
    return {
      password: "",
      status: "",
      is_loading: false
    };
  },

  componentDidMount: function() {
    ReactDOM.findDOMNode(this.refs.pwInput).focus();
  },

  setPassword: function(event) {
    this.setState({
      password: event.target.value
    });
  },

  submit: function(event) {
    var me = this;
    event.preventDefault();
    S3Manager.setPasswordAndReloadConfigs(me.state.password);
    me.setState({ is_loading: true });
    S3Manager.getS3().getObject({Bucket: S3Manager.bucket, Key: S3Manager.personal_notes_filename}, function(err, data) {
      if (err) {
        me.setState({
          status: err.code + ": " + err.message,
          is_loading: false
        });
      } else {
        me.props.routeToEditInitialText(buf2str(data.Body.buffer));
      }
    });
  },

  render: function() {
    var me = this;
    return (
      <div className="centerparent">
        <div className="centerchild">
          <form onSubmit={this.submit}>
            <input type="password" value={this.state.password} onChange={this.setPassword} className="main_pw" ref="pwInput" placeholder="Enter password"/>
            <input type="submit" className="save_btn" disabled={me.state.is_loading}/>
            <div className="error">{this.state.status}</div>
          </form>
        </div>
      </div>
    );
  }
})

const NotesEditor = React.createClass({
  enableBeforeUnload: function() {
    window.onbeforeunload = function (e) {
      return "Discard changes?";
    };
  },

  disableBeforeUnload: function() {
    window.onbeforeunload = null;
  },

  getInitialState: function() {
    return {
      text: this.props.initial_text,
      status: "Last loaded " + new Date().toLocaleString(),
      is_error: false,
      has_unsaved_changes: false,
      filename: S3Manager.personal_notes_filename
    }
  },

  componentDidMount: function() {
    var me = this;
    Mousetrap.bind(['ctrl+s', 'command+s'], function(e) {
      me.saveText();
      return false;
    });
  },

  componentWillUnmount: function() {
    Mousetrap.unbind(['ctrl+s', 'command+s']);
  },

  setText: function(event) {
    this.setState({
      text: event.target.value,
      has_unsaved_changes: true
    });
    this.enableBeforeUnload();
  },

  setFilename: function(event) {
    var me = this;
    if (this.state.has_unsaved_changes) {
      alert('Please save your changes.')
      return;
    }
    var new_filename = event.target.value;
    S3Manager.getS3().getObject({Bucket: S3Manager.bucket, Key: new_filename}, function(err, data) {
      if (err) {
        me.setState({
          status: err.code + ": " + err.message,
          is_error: true,
          filename: new_filename
        });
      } else {
        me.setState({
          text: buf2str(data.Body.buffer),
          status: "Last loaded " + new Date().toLocaleString(),
          is_error: false,
          has_unsaved_changes: false,
          filename: new_filename
        });
      }
    });
  },

  saveText: function() {
    var me = this;
    var put_options = {
      Bucket: S3Manager.bucket,
      Key: this.state.filename,
      ACL: S3Manager.private_acl,
      Body: str2buf(this.state.text)
    };

    S3Manager.getS3().putObject(put_options, function(err, data) {
      if (err) {
        me.setState({
          status: err.code + ": " + err.message,
          is_error: true
        });
      } else {
        me.setState({
          status: "Last saved " + new Date().toLocaleString(),
          is_error: false,
          has_unsaved_changes: false
        });
        me.disableBeforeUnload();
      }
    });
  },

  takeSnapshot: function() {
    var me = this;
    var snapshot_name = this.state.filename + '_backup/' + new Date().getTime();
    var put_options = {
      Bucket: S3Manager.bucket,
      Key: snapshot_name,
      ACL: S3Manager.private_acl,
      Body: str2buf(this.state.text)
    };

    S3Manager.getS3().putObject(put_options, function(err, data) {
      if (err) {
        me.setState({
          status: err.code + ": " + err.message,
          is_error: true
        });
      } else {
        me.setState({
          status: "Last saved snapshot " + snapshot_name,
          is_error: false,
          has_unsaved_changes: false
        });
      }
    });
  },

  startFileSelection: function() {
    document.getElementById('hidden_file_input').click();
  },

  uploadFile: function() {
    var me = this;
    var file_input = document.getElementById('hidden_file_input');
    var file = file_input.files[0];
    var upload_path = 'dropbox/' + file.name;
    if (file) {
      var put_options = {
        Bucket: S3Manager.bucket,
        Key: upload_path,
        ACL: S3Manager.public_acl,
        ContentType: file.type,
        Body: file
      };

      S3Manager.getS3().putObject(put_options, function(err, data) {
        if (err) {
          me.setState({
            status: err.code + ": " + err.message,
            is_error: true
          });
        } else {
          me.setState({
		  status: <span>Last saved <a href={"http://kkdo.me/" + upload_path}>{"http://kkdo.me/" + upload_path}</a></span>,
            is_error: false
          });
        }
      });
    }
  },

  render: function() {
    return (
      <div>
        <select value={this.state.filename} onChange={this.setFilename}>
          <option value={S3Manager.personal_notes_filename}>Personal notes</option>
          <option value={S3Manager.work_notes_filename}>Work notes</option>
        </select>
        <br />
        <textarea rows="40" cols="160" onChange={this.setText} value={this.state.text} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" className="mousetrap"/>
        <br />
        <button onClick={this.saveText} className="save_btn" disabled={!this.state.has_unsaved_changes}>Save</button>
        <button onClick={this.takeSnapshot} className="save_btn">Take snapshot</button>
        <button onClick={this.startFileSelection} className="save_btn">Upload a file</button>
        <input type="file" name="file" id="hidden_file_input" className="hidden" onChange={this.uploadFile} />
        <p className={this.state.is_error ? "error" : "success"}>{this.state.status}</p>
      </div>
    );
  }
});

ReactDOM.render(<Router />, document.getElementById('react_main'));
