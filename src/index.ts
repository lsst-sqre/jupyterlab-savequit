// Copyright (c) LSST DM/SQuaRE
// Distributed under the terms of the MIT License.

import {
  Menu
} from '@lumino/widgets';

import {
  showDialog, Dialog
} from '@jupyterlab/apputils';

import {
  IMainMenu
} from '@jupyterlab/mainmenu';

import {
  JupyterFrontEnd, JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  IDocumentManager
} from '@jupyterlab/docmanager';

import {
  PageConfig, URLExt
} from '@jupyterlab/coreutils';

import {
  ServiceManager, ServerConnection
} from '@jupyterlab/services';

import {
  each
} from '@lumino/algorithm';


/**
 * The command IDs used by the plugin.
 */
export
namespace CommandIDs {
  export const saveQuit: string = 'savequit:savequit';
  export const justQuit: string = 'justquit:justquit';
};


/**
 * Activate the jupyterhub extension.
 */
function activateSaveQuitExtension(app: JupyterFrontEnd, mainMenu: IMainMenu, docManager: IDocumentManager): void {

  // This config is provided by JupyterHub by the single-user server app
  // via in dictionary app.web_app.settings['page_config_data'].
  let hubHost = PageConfig.getOption('hubHost');
  let hubPrefix = PageConfig.getOption('hubPrefix');
  let hubUser = PageConfig.getOption('hubUser');

  if (!hubPrefix) {
    console.log('jupyterlab-savequit: No configuration found.');
    return;
  }

  console.log('jupyterlab-savequit: Found configuration ',
    { hubHost: hubHost, hubPrefix: hubPrefix, hubUser: hubUser });

  let svcManager = app.serviceManager;

  const { commands } = app;

  commands.addCommand(CommandIDs.saveQuit, {
    label: 'Save All and Exit',
    caption: 'Save open notebooks and destroy container',
    execute: () => {
      saveAndQuit(app, docManager, svcManager)
    }
  });

  commands.addCommand(CommandIDs.justQuit, {
    label: 'Exit Without Saving',
    caption: 'Destroy container',
    execute: () => {
      justQuit(app, docManager, svcManager)
    }
  });

  // Add commands and menu itmes.
  let menu: Menu.IItemOptions[] =
    [
      { command: CommandIDs.saveQuit },
      { command: CommandIDs.justQuit }
    ]
  // Put it at the bottom of file menu
  let rank = 150;
  mainMenu.fileMenu.addGroup(menu, rank);
}

function hubRequest(url: string, init: RequestInit, settings: ServerConnection.ISettings): Promise<Response> {
  // Fake out URL check in makeRequest
  let newSettings = ServerConnection.makeSettings({
    baseUrl: url,
    appUrl: settings.appUrl,
    wsUrl: settings.wsUrl,
    init: settings.init,
    token: settings.token,
    fetch: settings.fetch,
    Request: settings.Request,
    Headers: settings.Headers,
    WebSocket: settings.WebSocket
  });
  console.log("hubRequest: URL: ", url, " | New settings:", settings)
  return ServerConnection.makeRequest(url, init, newSettings)
}

function saveAll(app: JupyterFrontEnd, docManager: IDocumentManager, svcManager: ServiceManager): Promise<any> {
  let promises: Promise<any>[] = [];
  each(app.shell.widgets('main'), widget => {
    if (widget) {
      let context = docManager.contextForWidget(widget);
      if (context) {
        console.log("Saving context for widget:", { id: widget.id })
        promises.push(context.save())
      }
    } else {
      console.log("No context for widget:", { id: widget.id })
    }
  })
  console.log("Waiting for all save-document promises to resolve.")
  if (!promises) {
    promises.push(Promise.resolve(1))
  }
  Promise.all(promises);
  return promises[0]
}


function saveAndQuit(app: JupyterFrontEnd, docManager: IDocumentManager, svcManager: ServiceManager): Promise<any> {
  infoDialog()
  const retval = Promise.resolve(saveAll(app, docManager, svcManager));
  retval.then((res) => {
    return justQuit(app, docManager, svcManager)
  });
  retval.catch((err) => {
    console.log("saveAll failed: ", err.message);
  });
  console.log("Save and Quit complete.")
  return retval
}

function justQuit(app: JupyterFrontEnd, docManager: IDocumentManager, svcManager: ServiceManager): Promise<any> {
  infoDialog()
  return Promise.resolve(stopAndLogout(app, docManager, svcManager)
    .then(() => {
      console.log("Quit complete.")
    })
    .then(() => {
      window.location.replace("/")
    }))
}


function stopAndLogout(app: JupyterFrontEnd, docManager: IDocumentManager, svcManager: ServiceManager): Promise<any> {
  // Log the user out.
  let hubHost = PageConfig.getOption('hubHost');
  let hubPrefix = PageConfig.getOption('hubPrefix');
  let hubUser = PageConfig.getOption('hubUser');
  console.log("Logging out user:", { user: hubUser })
  let stopURL = hubHost + URLExt.join(hubPrefix, 'api/users',
    hubUser, 'server');
  let logoutURL = hubHost + URLExt.join(hubPrefix, 'logout');
  let settings = svcManager.serverSettings
  console.log("Service Settings: ", settings)
  let stopInit = {
    method: 'DELETE'
  };
  let logoutInit = {
    method: 'GET'
  };
  console.log("Making stop request to ", stopURL, "with settings ", settings)
  let r = hubRequest(stopURL, stopInit, settings)
    .then(response => {
      let status = response.status
      if (status < 200 || status >= 300) {
        console.log("Status ", status, "=>", response)
        Promise.reject(new ServerConnection.ResponseError(response))
      }
      return response
    })
    .then(() => {
      console.log("Making logout request to ", logoutURL)
      hubRequest(logoutURL, logoutInit, settings).
        then(response2 => {
          let status2 = response2.status
          if (status2 < 200 || status2 >= 300) {
            console.log("Status ", status2, "=>", response2)
            Promise.reject(new ServerConnection.ResponseError(response2))
          }
          return response2
        })
    }).then(() => {
      console.log("Stop and logout complete.")
    })
  return Promise.resolve(r)
}

function infoDialog(): Promise<void> {
  let options = {
    title: "Redirecting to landing page",
    body: "Please wait until you are redirected back to the landing page." +
    " If a server connection error appears, ignore it; it is harmless.",
    buttons: [Dialog.okButton()]
  };
  return showDialog(options).then(() => {
    console.log("Info dialog panel displayed")
  })
}

/**
 * Initialization data for the jupyterlab_savequit extension.
 */
const saveQuitExtension: JupyterFrontEndPlugin<void> = {
  activate: activateSaveQuitExtension,
  id: 'jupyter.extensions.jupyterlab-savequit',
  requires: [
    IMainMenu,
    IDocumentManager
  ],
  autoStart: true,
};

export default saveQuitExtension;

