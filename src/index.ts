// Copyright (c) LSST DM/SQuaRE
// Distributed under the terms of the MIT License.

import {
  Menu
} from '@phosphor/widgets';

import {
  ICommandPalette, IMainMenu, showDialog, Dialog
} from '@jupyterlab/apputils';

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
  IServiceManager, ServerConnection
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
  export const justQuit: string = 'savequit:justquit';
};


/**
 * Activate the jupyterhub extension.
 */
function activateHubExtension(app: JupyterLab, palette: ICommandPalette, mainMenu: IMainMenu, docManager: IDocumentManager, svcManager: IServiceManager): void {

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

  const category = 'Save/Exit';
  const { commands } = app;

  commands.addCommand(CommandIDs.saveQuit, {
    label: 'Save, Exit, and Log Out',
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
  let menu = new Menu({ commands });
  menu.title.label = category;
  [
    CommandIDs.saveQuit,
    CommandIDs.justQuit
  ].forEach(command => {
    palette.addItem({ command, category });
    menu.addItem({ command });
  });
  mainMenu.addMenu(menu, { rank: 100 });
}

function saveAndQuit(app: JupyterLab, docManager: IDocumentManager, svcManager: IServiceManager): Promise<void> {
  let promises: Promise<void>[] = [];
  each(app.shell.widgets('main'), widget => {
    let context = docManager.contextForWidget(widget);
    if (!context) {
      console.log("No context for widget:", { id: widget.id })
      return;
    }
    console.log("Saving context for widget:", { id: widget.id })
    promises.push(context.save().then(() => {
      return context.session.shutdown();
    }));
  });
  console.log("Waiting for all promises to resolve.")
  Promise.all(promises).then(() => {
    return justQuit(app, docManager, svcManager)
  })
  return Promise.resolve(null);
}

function justQuit(app: JupyterLab, docManager: IDocumentManager, svcManager: IServiceManager): Promise<void> {
  let promises: Promise<void>[] = [];
  promises.push(logOutUser(app, docManager, svcManager).then(() => { }))
  Promise.all(promises).then(() => {
    return showCloseOK()
    // return backToHub()
  })
  return Promise.resolve(null)
}

// function backToHub(): Promise<void> {
//   location.href = '/'
//   return Promise.resolve(null)
// }

function logOutUser(app: JupyterLab, docManager: IDocumentManager, svcManager: IServiceManager): Promise<void> {
  // Log the user out.
  let hubHost = PageConfig.getOption('hub_host');
  let hubPrefix = PageConfig.getOption('hub_prefix');
  let hubUser = PageConfig.getOption('hub_user');
  console.log("Logging out user:", { user: hubUser })
  let stopURL = hubHost + URLExt.join(hubPrefix, 'api/users',
    hubUser, 'server');
  let logoutURL = hubHost + URLExt.join(hubPrefix, 'logout');
  let settings = svcManager.serverSettings
  console.log("Settings: ", settings)
  let stopReq = {
    url: stopURL,
    method: 'DELETE'
  };
  let logoutReq = {
    url: logoutURL,
    method: 'GET'
  };
  console.log("Making stop request to ", stopURL, "with settings ", settings)
  ServerConnection.makeRequest(stopReq, settings).then(response => {
    let status = response.xhr.status
    if (status < 200 || status >= 300) {
      console.log("Status ", status, "=>", response)
      Promise.reject(ServerConnection.makeError(response))
    }
  }).then(() => {
    ServerConnection.makeRequest(logoutReq, settings).then(response2 => {
      let status2 = response2.xhr.status
      console.log("Making logout request to ", logoutURL)
      if (status2 < 200 || status2 >= 300) {
        console.log("Status ", status2, "=>", response2)
        Promise.reject(ServerConnection.makeError(response2))
      }
    }).then(() => {
      /* No-op */
    })
  })
  return Promise.resolve(null) // Should not reach
}



function showCloseOK(): Promise<void> {
  let options = {
    title: "Save and Quit complete",
    body: "It is now safe to close the browser window or tab.",
    buttons: [] as Dialog.IButton[]
  };
  return showDialog(options).then(() => { /* no-op */ });
}

/**
 * Initialization data for the jupyterlab_hub extension.
 */
const hubExtension: JupyterLabPlugin<void> = {
  activate: activateHubExtension,
  id: 'jupyter.extensions.jupyterlab-savequit',
  requires: [
    ICommandPalette,
    IMainMenu,
    IDocumentManager,
    IServiceManager
  ],
  autoStart: true,
};

export default hubExtension;

