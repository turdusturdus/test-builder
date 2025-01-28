1. **Building with npm**

   a. **Install Essential Dependencies**

      - **Node.js & npm**
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt install -y nodejs
        node -v
        npm -v       

   b. **Project Setup**
      - **Install Dependencies**
        npm install

      - **Install Playwright Browsers**
        npx playwright install-deps  
        npx playwright install
        
2. **Setting up Playwright, X, and Docker Environment**

   a. **Install Docker**
      sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
      sudo apt update
      sudo apt install -y docker-ce docker-ce-cli containerd.io
      sudo docker run hello-world
      

   b. **Install Docker Compose**
      
      sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
      sudo chmod +x /usr/local/bin/docker-compose
      docker-compose --version

   c. **Configure UI Tests Environment**
      - **Allow Docker Access to X Server**       
        xhost +local:docker
        

      - *(Optional)* **Install X11 Utilities**
        sudo apt install -y x11-apps
        
        