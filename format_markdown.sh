#!/usr/bin/env bash
# Author: Thoxvi <Thoxvi@Gmail.com>

for md_file in $(find -iname "*.md");do
    echo $md_file
    pangu -f $md_file > ${md_file}.tmp
    mv -v ${md_file}.tmp $md_file
done
