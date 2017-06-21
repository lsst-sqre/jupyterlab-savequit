// Copyright (c) LSST DM/SQuaRE
// Distributed under the terms of the MIT License.

import {
  Menu
} from '@phosphor/widgets';

import {
  ICommandPalette, IMainMenu
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
  export
    const saveQuit: string = 'savequit:savequit';
};


/**
 * Activate the jupyterhub extension.
 */
function activateHubExtension(app: JupyterLab, palette: ICommandPalette, mainMenu: IMainMenu, docManager: IDocumentManager, svcManager: IServiceManager): void {

  // This config is provided by JupyterHub by the single-user server app
  // via in dictionary app.web_app.settings['page_config_data'].
  let hubHost = PageConfig.getOption('hub_host');
  let hubPrefix = PageConfig.getOption('hub_prefix');

  if (!hubPrefix) {
    console.log('jupyterlab-savequit: No configuration found.');
    return;
  }

  console.log('jupyterlab-savequit: Found configuration ',
    { hubHost: hubHost, hubPrefix: hubPrefix });

  const category = 'SaveQuit';
  const { commands } = app;

  commands.addCommand(CommandIDs.saveQuit, {
    label: 'Save and Quit',
    caption: 'Save open notebooks, destroy container, and log out',
    execute: () => {
      saveAndQuit(app, docManager, svcManager)
    }
  });
  // Add commands and menu itmes.
  let menu = new Menu({ commands });
  menu.title.label = category;
  [
    CommandIDs.saveQuit,
  ].forEach(command => {
    palette.addItem({ command, category });
    menu.addItem({ command });
  });
  mainMenu.addMenu(menu, { rank: 100 });
}

function saveAndQuit(app: JupyterLab, docManager: IDocumentManager, svcManager: IServiceManager): void {
  let promises: Promise<void>[] = [];
  each(app.shell.widgets('main'), widget => {
    let context = docManager.contextForWidget(widget);
    if (!context) {
      return;
    }
    promises.push(context.save().then(() => {
      return context.session.shutdown();
    }));
  });
  Promise.all(promises).then(() => {
    // Log the user out.
    let hubHost = PageConfig.getOption('hub_host');
    let hubPrefix = PageConfig.getOption('hub_prefix');
    let hubUser = PageConfig.getOption('hub_user');
    let stopURL = hubHost + URLExt.join(hubPrefix, 'api/users',
      hubUser, 'server');
    let logoutURL = hubHost + URLExt.join(hubPrefix, 'logout');
    let settings = svcManager.serverSettings
    let stopReq = {
      url: stopURL,
      method: 'DELETE'
    };
    let logoutReq = {
      url: logoutURL,
      method: 'GET'
    };
    ServerConnection.makeRequest(stopReq, settings).then(response => {
      let status = response.xhr.status
      if (status < 200 || status >= 300) {
        throw ServerConnection.makeError(response)
      }
      ServerConnection.makeRequest(logoutReq, settings).then(response2 => {
        let status2 = response2.xhr.status
        if (status2 < 200 || status2 >= 300) {
          throw ServerConnection.makeError(response2)
        }
      })
    })
  });
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

