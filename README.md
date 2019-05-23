# jupyterlab-savequit

JupyterLab Save-and-Quit

This allows the user to save all notebooks, stop the container, and log
out of the hub.

## Prerequisites

* JupyterLab 1.0.0-alpha6 or later.
* A properly configured JupyterHub.

## Installation

To install this extension into JupyterLab, do the following:

```bash
jupyter labextension install jupyterlab-savequit
```

You will also need to start the single user servers in JupyterHub using the following command (that ships with JupyterLab 0.22 and greater):

```bash
jupyter labhub
```

## Development

For a development install (requires npm version 4 or later), do the following in the repository directory:

```bash
npm install
jupyter labextension link .
```

To rebuild the package and the JupyterLab app after making changes:

```bash
npm run build
jupyter lab build
```


