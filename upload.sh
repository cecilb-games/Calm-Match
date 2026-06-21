#!/bin/bash

npm run build
git add .
git commit -m "(automated)"
git push -u origin main

