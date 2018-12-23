#!/bin/bash
# create build package for Alexa, stage in s3 bucket, deploy package, then run a test to validate deployment

# these are parameters to change depending on the skill
buildfile='snowball.zip'
mainfunction='index.js'
bucketname='snowballfightgame'
binaryloc='s3://snowballfightgame/binary/'

# toggle which lambda function is being updated - assume two versions for rollouts
lambdaruntime='snowballFightGreen'
#lambdaruntime='snowballFightBlue'
echo 'deploying new function to ' $lambdaruntime

# the rest of this code is parameterized - don't change below
# create temp zip file with build package contents
echo 'zipping up '$mainfunction
zip -r $buildfile $mainfunction node_modules/ data/ > temp.log
echo 'build file created called'$buildfile

# stage the temp file in s3
aws s3 cp "$mainfunction" "$binaryloc"
aws s3 cp "$buildfile" "$binaryloc"
echo $buildfile' '$mainfunction' uploaded to s3'

# remove the temp file from the local machine
rm $buildfile
echo 'local cleanup complete'

# update the lambda function with the binaries that have been staged
aws lambda update-function-code --function-name "$lambdaruntime" --s3-bucket "$bucketname" --s3-key binary/"$buildfile" >> temp.log
echo 'new version of '$lambdaruntime

# read in test data required for a request to simulate launching the skill
echo 'test case 1 - launch request for '$lambdaruntime
cd testdata
request=$(<request.json)
cd ..

# invoke the new lambda function
aws lambda invoke --function-name "$lambdaruntime" --payload "$request" testOutput.json

# read response file into local variable then print on the console
response=$(<testOutput.json)
echo $response
echo 'test case 1 complete using '$lambdaruntime

