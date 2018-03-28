// Copyright (c) LSST DM/SQuaRE
// Distributed under the terms of the MIT License.

import {
  Menu
} from '@phosphor/widgets';

import {
  showDialog, Dialog
} from '@jupyterlab/apputils';

import {
  IMainMenu
} from '@jupyterlab/mainmenu';

import {
  JupyterLab, JupyterLabPlugin
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
} from '@phosphor/algorithm';


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
function activateSaveQuitExtension(app: JupyterLab, mainMenu: IMainMenu, docManager: IDocumentManager): void {

  // This config is provided by JupyterHub by the single-user server app
  // via in dictionary app.web_app.settings['page_config_data'].
  let hubHost = PageConfig.getOption('hub_host');
  let hubPrefix = PageConfig.getOption('hub_prefix');
  let hubUser = PageConfig.getOption('hub_user');

  if (!hubPrefix) {
    console.log('jupyterlab-savequit: No configuration found.');
    return;
  }

  console.log('jupyterlab-savequit: Found configuration ',
    { hubHost: hubHost, hubPrefix: hubPrefix, hubUser: hubUser });

  let svcManager = app.serviceManager;

  const { commands } = app;

  commands.addCommand(CommandIDs.saveQuit, {
    label: 'Save All, Exit, and Log Out',
    caption: 'Save open notebooks, destroy container, and log out',
    execute: () => {
      saveAndQuit(app, docManager, svcManager)
    }
  });

  commands.addCommand(CommandIDs.justQuit, {
    label: 'Exit and Log Out Without Saving',
    caption: 'Destroy container and log out',
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
  let rank = 125;
  mainMenu.fileMenu.addGroup(menu, rank);
}

function hubRequest(url: string, init: RequestInit, settings: ServerConnection.ISettings): Promise<Response> {
  // Fake out URL check in makeRequest
  let newSettings = ServerConnection.makeSettings({
    baseUrl: url,
    pageUrl: settings.pageUrl,
    wsUrl: settings.wsUrl,
    init: settings.init,
    token: settings.token,
    Request: settings.Request,
    Headers: settings.Headers,
    WebSocket: settings.WebSocket
  });
  return ServerConnection.makeRequest(url, init, newSettings)
}

function saveAll(app: JupyterLab, docManager: IDocumentManager, svcManager: ServiceManager): Promise<any> {
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


function saveAndQuit(app: JupyterLab, docManager: IDocumentManager, svcManager: ServiceManager): Promise<any> {
  infoDialog()
  return Promise.resolve(saveAll(app, docManager, svcManager)
    .then(() => {
      return justQuit(app, docManager, svcManager)
    })
    .then(() => {
      console.log("Save and Quit complete.")
    }))
}

function justQuit(app: JupyterLab, docManager: IDocumentManager, svcManager: ServiceManager): Promise<any> {
  infoDialog()
  return Promise.resolve(stopAndLogout(app, docManager, svcManager)
    .then(() => {
      showCloseOK()
    })
    .then(() => {
      console.log("Quit complete.")
    }))
}

function stopAndLogout(app: JupyterLab, docManager: IDocumentManager, svcManager: ServiceManager): Promise<any> {
  // Log the user out.
  let hubHost = PageConfig.getOption('hub_host');
  let hubPrefix = PageConfig.getOption('hub_prefix');
  let hubUser = PageConfig.getOption('hub_user');
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

function showCloseOK(): Promise<void> {
  let options = {
    title: "Shutdown complete",
    body: "It is now safe to close the browser window or tab.",
    buttons: [] as Dialog.IButton[]
  };
  return showDialog(options).then(() => {
    console.log("Shutdown panel displayed")
  })
}

function infoDialog(): Promise<void> {
  let options = {
    title: "Wait for confirmation",
    body: "Please wait for confirmation that it is safe to close the" +
    " browser window or tab.  If a server connection error appears," +
    " ignore it; it is harmless.",
    buttons: [Dialog.okButton()]
  };
  return showDialog(options).then(() => {
    console.log("Info dialog panel displayed")
  })
}

/**
 * Initialization data for the jupyterlab_savequit extension.
 */
const saveQuitExtension: JupyterLabPlugin<void> = {
  activate: activateSaveQuitExtension,
  id: 'jupyter.extensions.jupyterlab-savequit',
  requires: [
    IMainMenu,
    IDocumentManager
  ],
  autoStart: true,
};

export default saveQuitExtension;

