# This is the README for the Thermal Comfort Visualisation Application

The GitHub repository is not required if you chose to run the application in a Docker Container

# Download the docker-compose.yml file

# Go to shinyweatherdata.com
- Select the city and time frame (01.01.2014-31.12.2023)
- Click on "Export"
- Chose the EnergyPlus (epw) File
- Click on "Format"
- Open the developer options of your browser with F12
- Select the "Network" Option (see screenshot)
- Press "Downlaod File"
- Copy the URL from the GET request for the document (see screenshot)
- Paste this URL in the terminal input (might need to use Ctrl+Shift+v)

![alt text](https://github.com/test.png "shinyweatherdata.com")

# Process data (runs once, doesn't restart automatically)
docker compose run process

# Start the web application (frontend + tile server)
docker compose up -d

# Visit localhost:3000 to see the application
